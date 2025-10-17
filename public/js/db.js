// public/js/db.js
const db = new Dexie('maintenanceApp');

// CRITICAL FIX: Incremented DB version to 8 to add indexes for filtering.
db.version(8).stores({
  pendingSubmissions: '++id, assignmentId, timestamp',
  assets: '&_id, name, floor, category, zone', // Added category and zone for filtering
  assignments: '&_id, asset, checklist',
  checklists: '&_id, title',
});


async function cacheData(assets, assignments, checklists) {
  try {
    console.log(`Caching ${assets.length} assets, ${assignments.length} assignments, and ${checklists.length} checklists.`);

    await db.transaction('rw', db.assets, db.assignments, db.checklists, async () => {
        await db.assets.clear();
        await db.assignments.clear();
        await db.checklists.clear();

        const validAssets = assets.filter(a => a && a._id);
        const validAssignments = assignments.filter(a => a && a._id);
        const validChecklists = checklists.filter(c => c && c._id);

        await db.assets.bulkPut(validAssets);
        await db.assignments.bulkPut(validAssignments);
        await db.checklists.bulkPut(validChecklists);
    });
    console.log('Cache successful: Core offline data has been synced.');
  } catch (error) {
    console.error('Failed to cache data:', error);
  }
}

// NEW FUNCTION to get all data for offline dashboard rendering
async function getAllOfflineData() {
    try {
        const [assets, assignments, checklists] = await db.transaction('r', db.assets, db.assignments, db.checklists, async () => {
            const assets = await db.assets.toArray();
            const assignments = await db.assignments.toArray();
            const checklists = await db.checklists.toArray();
            return [assets, assignments, checklists];
        });

        // Create maps for quick lookups
        const checklistMap = new Map(checklists.map(c => [c._id, c]));
        
        // Add full asset objects to a map, including their category, floor, and zone names which are already populated from the server sync
        const assetMap = new Map(assets.map(a => [a._id, a]));

        // Augment assignments with full checklist and asset data
        const augmentedAssignments = assignments.map(assign => {
            const checklistId = typeof assign.checklist === 'string' ? assign.checklist : assign.checklist?._id;
            const assetId = typeof assign.asset === 'string' ? assign.asset : assign.asset?._id;
            
            return {
                ...assign,
                checklist: checklistMap.get(checklistId),
                asset: assetMap.get(assetId)
            };
        }).filter(a => a.checklist && a.asset); // Filter out any assignments with missing data

        return {
            assignments: augmentedAssignments,
        };
    } catch (error) {
        console.error('Failed to get all offline data:', error);
        return { assignments: [] };
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

        // The asset and checklist objects are nested within the assignment record.
        // We don't need to do separate lookups.
        const asset = assignment.asset;
        const checklist = assignment.checklist;

        if (!asset || !checklist) {
            console.error('[Offline DB] FAILED: Assignment is missing nested asset or checklist object.');
            // As a fallback, try to look them up by ID if they exist as strings
            const assetId = typeof asset === 'object' ? asset._id : asset;
            const checklistId = typeof checklist === 'object' ? checklist._id : checklist;

            if (!assetId || !checklistId) return null;

            const fetchedAsset = await db.assets.get(assetId);
            const fetchedChecklist = await db.checklists.get(checklistId);

            if (!fetchedAsset || !fetchedChecklist) {
                 console.error('[Offline DB] FAILED: Fallback lookup for asset/checklist also failed.');
                 return null;
            }
             console.log('[Offline DB] SUCCESS: Fallback lookup successful.');
            return { assignment, asset: fetchedAsset, checklist: fetchedChecklist };
        }

        console.log('[Offline DB] All data loaded successfully from nested objects.');
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
    // Sort by the timestamp to show newest pending reports first.
    return await db.pendingSubmissions.orderBy('timestamp').reverse().toArray();
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

async function forceSync() {
    const pending = await getPendingSubmissions();
    if (pending.length === 0) {
        return { successful: 0, failed: 0 };
    }

    let successfulSyncs = 0;
    let failedSyncs = 0;

    for (const submission of pending) {
        try {
            const payload = {
                assignmentId: submission.assignmentId,
                results: submission.results,
                note: submission.note
            };

            const response = await fetch('/api/sync/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                await deletePendingSubmission(submission.id);
                successfulSyncs++;
            } else {
                failedSyncs++;
            }
        } catch (error) {
            failedSyncs++;
            break;
        }
    }
    return { successful: successfulSyncs, failed: failedSyncs };
}