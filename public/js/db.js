// public/js/db.js
const db = new Dexie('maintenanceApp');

db.version(3).stores({
  pendingSubmissions: '++id, assignmentId',
  assets: '&_id, name, floor',
  assignments: '&_id, asset, checklist',
  checklists: '&_id, title'
});

async function cacheData(assets, assignments, checklists) {
  try {
    await db.transaction('rw', db.assets, db.assignments, db.checklists, async () => {
        await db.assets.clear();
        await db.assignments.clear();
        await db.checklists.clear();
        
        await db.assets.bulkPut(assets);
        await db.assignments.bulkPut(assignments);
        await db.checklists.bulkPut(checklists);
    });
    console.log('Cache berhasil: Assets, assignments, dan checklists tersimpan offline.');
  } catch (error) {
    console.error('Gagal menyimpan cache:', error);
  }
}

async function getAssetAndAssignmentsOffline(assetId) {
    try {
        const asset = await db.assets.get(assetId);
        
        const allAssignments = await db.assignments.toArray();
        const assignments = allAssignments.filter(a => a.asset && a.asset._id === assetId);

        for (let i = 0; i < assignments.length; i++) {
            if (assignments[i].checklist) {
                const checklistId = assignments[i].checklist._id || assignments[i].checklist;
                assignments[i].checklist = await db.checklists.get(checklistId);
            }
        }
        return { asset, assignments };
    } catch (error) {
        console.error('Gagal mengambil data asset offline:', error);
        return { asset: null, assignments: [] };
    }
}

async function getChecklistDataOffline(assignmentId) {
    try {
        const assignment = await db.assignments.get(assignmentId);
        if (!assignment) return null;
        const asset = await db.assets.get(assignment.asset._id);
        const checklist = await db.checklists.get(assignment.checklist._id);
        return { assignment, asset, checklist };
    } catch (error) {
        console.error('Gagal mengambil data checklist offline:', error);
        return null;
    }
}

async function addPendingSubmission(submissionData) {
  try {
    await db.pendingSubmissions.add(submissionData);
    console.log('Submission berhasil disimpan lokal untuk sinkronisasi.');
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(swRegistration) {
        return swRegistration.sync.register('sync-checklist-submissions');
      });
    }
  } catch (error) {
    console.error('Gagal menyimpan submission lokal:', error);
  }
}

async function getPendingSubmissions() {
  try {
    return await db.pendingSubmissions.toArray();
  } catch (error) {
    console.error('Gagal mengambil submission yang tertunda:', error);
    return [];
  }
}

async function deletePendingSubmission(id) {
  try {
    await db.pendingSubmissions.delete(id);
    console.log(`Submission yang telah sinkron (id: ${id}) berhasil dihapus.`);
  } catch (error) {
    console.error('Gagal menghapus submission yang telah sinkron:', error);
  }
}

async function countPendingSubmissions() {
    try {
        return await db.pendingSubmissions.count();
    } catch (error) {
        console.error('Gagal menghitung submission yang tertunda:', error);
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
