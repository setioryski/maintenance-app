// public/js/db.js
const db = new Dexie('maintenanceApp');

// VERSI 3: Menambahkan tabel 'checklists'
db.version(3).stores({
  pendingSubmissions: '++id, assignmentId',
  assets: '&_id, name, floor',
  assignments: '&_id, asset, checklist',
  checklists: '&_id, title' // Tabel baru untuk menyimpan detail checklist
});

/**
 * Menyimpan semua data penting (assets, assignment, checklist) ke database lokal.
 * @param {Array} assets - Array berisi objek asset.
 * @param {Array} assignments - Array berisi objek assignment.
 * @param {Array} checklists - Array berisi objek checklist.
 */
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

/**
 * Mengambil data asset dan assignment-nya dari database lokal.
 * @param {string} assetId - ID dari asset yang akan diambil.
 */
async function getAssetAndAssignmentsOffline(assetId) {
    try {
        const asset = await db.assets.get(assetId);
        const assignments = await db.assignments.where({ asset: assetId }).toArray();

        // Ambil detail checklist untuk setiap assignment
        for (let i = 0; i < assignments.length; i++) {
            assignments[i].checklist = await db.checklists.get(assignments[i].checklist);
        }

        return { asset, assignments };
    } catch (error) {
        console.error('Gagal mengambil data asset offline:', error);
        return { asset: null, assignments: [] };
    }
}


// --- Fungsi untuk submission yang tertunda (tidak ada perubahan) ---

async function addPendingSubmission(submissionData) {
  try {
    await db.pendingSubmissions.add(submissionData);
    console.log('Submission berhasil disimpan lokal untuk sinkronisasi.');
    // Daftarkan background sync
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