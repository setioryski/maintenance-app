// public/js/db.js
const db = new Dexie('maintenanceApp');

// Incremented DB version to apply the new table schema cleanly
db.version(5).stores({
  pendingSubmissions: '++id, assignmentId',
  assets: '&_id, name, floor',
  assignments: '&_id, asset, checklist',
  checklists: '&_id, title',
  completedReports: '&_id, completedAt'
});

async function cacheData(assets, assignments, checklists, completedReports = []) {
  try {
    console.log(`Caching ${assets.length} assets, ${assignments.length} assignments, ${checklists.length} checklists, and ${completedReports.length} reports.`);

    await db.transaction('rw', db.assets, db.assignments, db.checklists, db.completedReports, async () => {
        // Clear all tables to ensure a fresh sync
        await db.assets.clear();
        await db.assignments.clear();
        await db.checklists.clear();
        await db.completedReports.clear(); // <-- THE CRITICAL FIX: Clear old reports

        // Filter out any potentially invalid data before caching
        const validAssets = assets.filter(a => a && a._id);
        const validAssignments = assignments.filter(a => a && a._id);
        const validChecklists = checklists.filter(c => c && c._id);
        const validReports = completedReports.filter(r => r && r._id);

        // Bulk-add the new, fresh data
        await db.assets.bulkPut(validAssets);
        await db.assignments.bulkPut(validAssignments);
        await db.checklists.bulkPut(validChecklists);
        await db.completedReports.bulkPut(validReports);
    });
    console.log('Cache successful: All offline data has been synced.');
  } catch (error) {
    console.error('Failed to cache data:', error);
  }
}

// NEW function to get completed reports for the offline report list
async function getCompletedReportsOffline() {
    try {
        return await db.completedReports.orderBy('completedAt').reverse().toArray();
    } catch (error) {
        console.error('Failed to get offline completed reports:', error);
        return [];
    }
}

// NEW function to get a single completed report by its ID
async function getCompletedReportById(id) {
    try {
        return await db.completedReports.get(id);
    } catch (error) {
        console.error(`Failed to get offline completed report with id ${id}:`, error);
        return null;
    }
}


async function getAssetAndAssignmentsOffline(assetId) {
    try {
        const asset = await db.assets.get(assetId);
        if (!asset) {
             console.error(`Offline Error: Asset with ID ${assetId} not found in local database.`);
             return { asset: null, assignments: [] };
        }
        
        const allAssignments = await db.assignments.toArray();
        const assignmentsForAsset = allAssignments.filter(a => {
            if (!a.asset) return false;
            const currentAssetId = typeof a.asset === 'string' ? a.asset : a.asset._id;
            return currentAssetId === assetId;
        });

        for (let i = 0; i < assignmentsForAsset.length; i++) {
            const assignment = assignmentsForAsset[i];
            if (assignment.checklist) {
                const checklistId = typeof assignment.checklist === 'string' ? assignment.checklist : assignment.checklist._id;
                assignment.checklist = await db.checklists.get(checklistId);
            }
        }
        return { asset, assignments: assignmentsForAsset };
    } catch (error) {
        console.error('Failed to get offline asset data:', error);
        return { asset: null, assignments: [] };
    }
}

async function getChecklistDataOffline(assignmentId) {
    console.log(`Attempting to load offline checklist data for assignment: ${assignmentId}`);
    try {
        const assignment = await db.assignments.get(assignmentId);
        if (!assignment) {
            console.error(`[Offline DB] FAILED: Assignment document with ID "${assignmentId}" not found in 'assignments' table.`);
            return null;
        }
        console.log('[Offline DB] SUCCESS: Found assignment document:', assignment);

        const assetId = assignment.asset && typeof assignment.asset === 'object' ? assignment.asset._id : assignment.asset;
        if (!assetId) {
            console.error(`[Offline DB] FAILED: The found assignment document has no 'asset' reference.`, assignment);
            return null;
        }
        console.log(`[Offline DB] INFO: Looking for asset with ID: "${assetId}"`);

        const asset = await db.assets.get(assetId);
        if (!asset) {
            console.error(`[Offline DB] FAILED: Asset with ID "${assetId}" not found in 'assets' table.`);
            return null;
        }
        console.log('[Offline DB] SUCCESS: Found asset document:', asset);
        
        const checklistId = assignment.checklist && typeof assignment.checklist === 'object' ? assignment.checklist._id : assignment.checklist;
        if (!checklistId) {
            console.error(`[Offline DB] FAILED: The found assignment document has no 'checklist' reference.`, assignment);
            return null;
        }
        console.log(`[Offline DB] INFO: Looking for checklist with ID: "${checklistId}"`);

        const checklist = await db.checklists.get(checklistId);
        if (!checklist) {
            console.error(`[Offline DB] FAILED: Checklist with ID "${checklistId}" not found in 'checklists' table.`);
            return null;
        }
        console.log('[Offline DB] SUCCESS: Found checklist document:', checklist);

        console.log('[Offline DB] All data loaded successfully.');
        return { assignment, asset, checklist };
    } catch (error) {
        console.error('A critical error occurred in getChecklistDataOffline:', error);
        return null;
    }
}

async function addPendingSubmission(submissionData) {
  try {
    await db.pendingSubmissions.add(submissionData);
    console.log('Submission successfully saved locally for sync.');
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(swRegistration) {
        return swRegistration.sync.register('sync-checklist-submissions');
      });
    }
  } catch (error) {
    console.error('Failed to save submission locally:', error);
  }
}

async function getPendingSubmissions() {
  try {
    return await db.pendingSubmissions.toArray();
  } catch (error) {
    console.error('Failed to get pending submissions:', error);
    return [];
  }
}

async function deletePendingSubmission(id) {
  try {
    await db.pendingSubmissions.delete(id);
    console.log(`Synced submission (id: ${id}) deleted successfully.`);
  } catch (error) {
    console.error('Failed to delete synced submission:', error);
  }
}

async function countPendingSubmissions() {
    try {
        return await db.pendingSubmissions.count();
    } catch (error) {
        console.error('Failed to count pending submissions:', error);
        return 0;
    }
}

// NEW FUNCTION TO MANUALLY TRIGGER SYNC
async function forceSync() {
    const pending = await getPendingSubmissions();
    if (pending.length === 0) {
        return { successful: 0, failed: 0 };
    }

    let successfulSyncs = 0;
    let failedSyncs = 0;

    for (const submission of pending) {
        try {
            const response = await fetch('/api/sync/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submission),
            });

            if (response.ok) {
                await deletePendingSubmission(submission.id);
                successfulSyncs++;
            } else {
                failedSyncs++;
            }
        } catch (error) {
            failedSyncs++;
            // If any fetch fails, stop and rely on background sync for the rest
            break;
        }
    }
    return { successful: successfulSyncs, failed: failedSyncs };
}