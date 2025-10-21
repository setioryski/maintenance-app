// public/js/db.js
const db = new Dexie('maintenanceApp');

// CRITICAL FIX: Incremented DB version to 8 to add indexes for filtering.
db.version(8).stores({
  pendingSubmissions: '++id, assignmentId, timestamp', // Auto-incrementing primary key 'id', index on assignmentId and timestamp
  assets: '&_id, name, floor, category, zone', // Primary key '_id', indexes on name, floor, category, zone
  assignments: '&_id, asset, checklist', // Primary key '_id', indexes on asset and checklist refs
  checklists: '&_id, title', // Primary key '_id', index on title
});


/**
 * Caches data fetched from the server into IndexedDB.
 * Clears existing data before adding new data.
 * @param {Array} assets - Array of asset objects from the server.
 * @param {Array} assignments - Array of assignment objects from the server.
 * @param {Array} checklists - Array of checklist objects from the server.
 */
async function cacheData(assets, assignments, checklists) {
  try {
    console.log(`Caching ${assets?.length || 0} assets, ${assignments?.length || 0} assignments, and ${checklists?.length || 0} checklists.`);

    // Ensure input arrays are valid
    const validAssets = (assets || []).filter(a => a && a._id);
    const validAssignments = (assignments || []).filter(a => a && a._id && a.asset && a.checklist); // Ensure refs exist
    const validChecklists = (checklists || []).filter(c => c && c._id);


    await db.transaction('rw', db.assets, db.assignments, db.checklists, async () => {
        // Clear existing data first
        await db.assets.clear();
        await db.assignments.clear();
        await db.checklists.clear();

        // Bulk add new data if available
        if (validAssets.length > 0) await db.assets.bulkPut(validAssets);
        if (validAssignments.length > 0) await db.assignments.bulkPut(validAssignments);
        if (validChecklists.length > 0) await db.checklists.bulkPut(validChecklists);
    });
    console.log('Cache successful: Core offline data has been synced.');
  } catch (error) {
    console.error('Failed to cache data:', error);
     // More detailed error logging for bulkPut issues
     if (error.failures && error.failures.length > 0) {
        console.error('Dexie bulkPut failures (showing first 10):', error.failures.slice(0, 10));
     }
  }
}

/**
 * Retrieves all necessary data (assignments with populated assets and checklists)
 * for rendering the offline technician dashboard.
 * @returns {Promise<Object>} Object containing augmented assignments.
 */
async function getAllOfflineData() {
    try {
        console.log("Attempting to fetch all offline data for dashboard...");
        const [assets, assignments, checklists] = await db.transaction('r', db.assets, db.assignments, db.checklists, async () => {
            // Fetch all records from each table
            const assets = await db.assets.toArray();
            const assignments = await db.assignments.toArray();
            const checklists = await db.checklists.toArray();
            return [assets, assignments, checklists];
        });
         console.log(`Fetched offline: ${assets.length} assets, ${assignments.length} assignments, ${checklists.length} checklists.`);

        // Create maps for efficient lookups using stringified _id
        const checklistMap = new Map(checklists.map(c => [c._id.toString(), c]));
        const assetMap = new Map(assets.map(a => [a._id.toString(), a]));

        // Augment assignments with full checklist and asset data
        const augmentedAssignments = assignments.map(assign => {
             // Handle cases where asset/checklist might be stored as just ID string or object with _id
            const checklistId = typeof assign.checklist === 'string' ? assign.checklist : assign.checklist?._id?.toString();
            const assetId = typeof assign.asset === 'string' ? assign.asset : assign.asset?._id?.toString();

            const foundChecklist = checklistMap.get(checklistId);
            const foundAsset = assetMap.get(assetId);

            // Return assignment only if both checklist and asset data are found
            if (foundChecklist && foundAsset) {
                // Return a reconstructed assignment object with full asset/checklist details
                // This mimics the populated data structure from the server
                return {
                    ...assign, // Keep original assignment fields (_id, assignedAt, etc.)
                    checklist: foundChecklist,
                    asset: foundAsset // Asset object includes populated floor/zone/category from sync
                };
            }
            // Log if essential data is missing for an assignment
            console.warn(`Skipping assignment ${assign._id}: Missing related data. Checklist ID: ${checklistId}, Asset ID: ${assetId}. Found Checklist: ${!!foundChecklist}, Found Asset: ${!!foundAsset}`);
            return null; // Mark for filtering
        }).filter(a => a !== null); // Remove assignments with missing data

         console.log(`Returning ${augmentedAssignments.length} augmented assignments for offline dashboard.`);
        return {
            assignments: augmentedAssignments,
        };
    } catch (error) {
        console.error('Failed to get all offline data:', error);
        return { assignments: [] }; // Return empty array on error
    }
}

/**
 * Retrieves a specific asset and its associated assignments (with populated checklists)
 * for the offline asset detail page.
 * @param {string} assetId - The ID of the asset to retrieve.
 * @returns {Promise<Object>} Object containing the asset and its augmented assignments.
 */
async function getAssetAndAssignmentsOffline(assetId) {
    try {
        console.log(`Fetching offline data for asset ID: ${assetId}`);
         // Fetch asset, its assignments, and all checklists concurrently
        const [asset, assignmentsForAssetRaw, allChecklists] = await db.transaction('r', db.assets, db.assignments, db.checklists, async () => {
            const asset = await db.assets.get(assetId); // Get asset by its primary key
            if (!asset) return [null, [], []]; // Asset not found
            // Efficiently get assignments referencing this asset's ID
            const assignments = await db.assignments.where({ asset: assetId }).toArray();
            const checklists = await db.checklists.toArray(); // Needed to populate titles
            return [asset, assignments, checklists];
        });


        if (!asset) {
             console.error(`Offline Error: Asset with ID ${assetId} not found in local database.`);
             return { asset: null, assignments: [] };
        }

        const checklistMap = new Map(allChecklists.map(c => [c._id.toString(), c]));

        // Populate checklist details into the assignments
        const assignmentsForAsset = assignmentsForAssetRaw.map(assign => {
             const checklistId = typeof assign.checklist === 'string' ? assign.checklist : assign.checklist?._id?.toString();
             const foundChecklist = checklistMap.get(checklistId);
             if (foundChecklist) {
                 return { ...assign, checklist: foundChecklist }; // Attach the full checklist object
             }
             console.warn(`Assignment ${assign._id} (for asset ${assetId}) missing checklist ${checklistId} in cache.`);
             return null; // Mark for filtering if checklist data is missing
         }).filter(a => a !== null);


        console.log(`Found asset "${asset.name}" and ${assignmentsForAsset.length} valid assignments offline.`);
        return { asset, assignments: assignmentsForAsset };
    } catch (error) {
        console.error(`Failed to get offline asset data for ID ${assetId}:`, error);
        return { asset: null, assignments: [] }; // Return empty on error
    }
}

/**
 * Retrieves all data (assignment, asset, checklist) needed for the offline checklist form.
 * @param {string} assignmentId - The ID of the ChecklistAssignment.
 * @returns {Promise<Object|null>} Object containing assignment, asset, checklist, or null if not found.
 */
async function getChecklistDataOffline(assignmentId) {
    console.log(`Attempting to load offline checklist data for assignment: ${assignmentId}`);
    try {
        // 1. Get the assignment record itself
        const assignment = await db.assignments.get(assignmentId);
        if (!assignment) {
            console.error(`[Offline DB] FAILED: Assignment "${assignmentId}" not found in 'assignments' table.`);
            return null;
        }

        // 2. Get the referenced Asset ID and Checklist ID
        const assetId = typeof assignment.asset === 'string' ? assignment.asset : assignment.asset?._id?.toString();
        const checklistId = typeof assignment.checklist === 'string' ? assignment.checklist : assignment.checklist?._id?.toString();

        if (!assetId || !checklistId) {
             console.error(`[Offline DB] FAILED: Assignment ${assignmentId} is missing asset (${assetId}) or checklist (${checklistId}) reference.`);
             return null;
        }

        // 3. Fetch the full Asset and Checklist records concurrently
        const [asset, checklist] = await db.transaction('r', db.assets, db.checklists, async () => {
             const asset = await db.assets.get(assetId);
             const checklist = await db.checklists.get(checklistId);
             return [asset, checklist];
        });

        // 4. Validate that both asset and checklist were found
        if (!asset) {
            console.error(`[Offline DB] FAILED: Asset record not found for ID: ${assetId} (Assignment: ${assignmentId})`);
            return null;
        }
        if (!checklist) {
             console.error(`[Offline DB] FAILED: Checklist record not found for ID: ${checklistId} (Assignment: ${assignmentId})`);
             return null;
        }


        console.log('[Offline DB] Successfully loaded assignment, asset, and checklist data.');
        // Return structured data, including the original assignment record enhanced with full objects
        return {
             assignment: { ...assignment, asset: asset, checklist: checklist },
             asset: asset,
             checklist: checklist
        };
    } catch (error) {
        console.error(`A critical error occurred in getChecklistDataOffline for assignment ${assignmentId}:`, error);
        return null; // Return null on any error
    }
}

/**
 * Adds a completed checklist submission to the pending queue in IndexedDB.
 * @param {Object} submissionData - Data containing assignmentId, results, note, etc.
 * @returns {Promise<void>}
 */
async function addPendingSubmission(submissionData) {
  try {
    // Add the submission; Dexie auto-increments the 'id' primary key
    const addedId = await db.pendingSubmissions.add(submissionData);
    console.log(`Submission saved locally for sync (Local ID: ${addedId}, Assignment: ${submissionData.assignmentId})`);
    // Trigger background sync task
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(swRegistration) {
        console.log('Registering background sync task: sync-checklist-submissions');
        return swRegistration.sync.register('sync-checklist-submissions');
      }).catch(err => console.error("Background sync registration failed:", err));
    } else {
         console.warn("Background sync not supported in this browser.");
    }
  } catch (error) {
    console.error('Failed to save submission locally:', error);
    throw error; // Re-throw error so the calling function (e.g., offline form submit) knows it failed
  }
}

/**
 * Retrieves all pending checklist submissions from IndexedDB, ordered by timestamp descending.
 * @returns {Promise<Array>} Array of pending submission objects.
 */
async function getPendingSubmissions() {
  try {
    // Order by timestamp, newest first, using reverse()
    return await db.pendingSubmissions.orderBy('timestamp').reverse().toArray();
  } catch (error) {
    console.error('Failed to get pending submissions:', error);
    return []; // Return empty array on error
  }
}

/**
 * Deletes a specific pending submission from IndexedDB using its local auto-incremented ID.
 * @param {number} id - The local primary key ID of the submission to delete.
 * @returns {Promise<void>}
 */
async function deletePendingSubmission(id) {
  try {
    await db.pendingSubmissions.delete(id);
    console.log(`Synced submission (local ID: ${id}) deleted from pending queue.`);
  } catch (error) {
    console.error(`Failed to delete synced submission (local ID: ${id}):`, error);
     // Consider how to handle deletion errors - potentially retry later?
  }
}

/**
 * Counts the number of pending submissions in IndexedDB.
 * @returns {Promise<number>} The count of pending submissions.
 */
async function countPendingSubmissions() {
    try {
        return await db.pendingSubmissions.count();
    } catch (error) {
        console.error('Failed to count pending submissions:', error);
        return 0; // Return 0 on error
    }
}

/**
 * Attempts to sync all pending submissions with the server immediately.
 * Sets a localStorage flag if any submissions are successfully synced.
 * @returns {Promise<Object>} Object containing counts of successful, failed, and total sync attempts.
 */
async function forceSync() {
    const pending = await getPendingSubmissions();
    const totalToSync = pending.length;
    if (totalToSync === 0) {
        console.log("No pending submissions to sync.");
        return { successful: 0, failed: 0, total: 0 };
    }

    let successfulSyncs = 0;
    let failedSyncs = 0;
    console.log(`Attempting to sync ${totalToSync} submissions...`);

    for (const submission of pending) {
        // Ensure submission has necessary data before attempting sync
        if (!submission || !submission.id || !submission.assignmentId || !submission.results) {
             console.error(" -> Skipping invalid pending submission object:", submission);
             failedSyncs++; // Count as failed if data is corrupt/missing
             continue;
        }

        try {
            const payload = {
                assignmentId: submission.assignmentId,
                results: submission.results,
                note: submission.note || '' // Ensure note is included, default to empty string
            };

            console.log(` -> Syncing local ID: ${submission.id}, Assignment: ${payload.assignmentId}`);
            const response = await fetch('/api/sync/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                // Sync successful, delete from local DB
                await deletePendingSubmission(submission.id); // Use the local 'id'
                successfulSyncs++;
                console.log(` -> Sync SUCCESS for local ID: ${submission.id}`);
            } else {
                // Sync failed on server-side
                failedSyncs++;
                console.error(` -> Sync FAILED for local ID: ${submission.id}. Server Status: ${response.status}`);
                 // Log server error message if available
                 try {
                     const errorData = await response.json();
                     console.error(` -> Server error message: ${errorData.message || 'No message provided.'}`);
                 } catch (e) {
                      console.error(` -> Could not parse error response from server.`);
                 }
                 // Do NOT delete from local DB if server fails
            }
        } catch (error) {
            // Network error or other fetch-related issue
            failedSyncs++;
            console.error(` -> Network/Fetch ERROR during sync for local ID: ${submission.id}. Stopping sync attempt.`, error);
            // Stop the sync process on the first network error to avoid repeated failures
            break;
        }
    }

    console.log(`Sync finished: ${successfulSyncs} successful, ${failedSyncs} failed out of ${totalToSync}.`);

    // *** Set localStorage flag if any syncs were successful ***
    if (successfulSyncs > 0) {
        localStorage.setItem('showSyncSuccessToast', successfulSyncs.toString());
         console.log(`Set flag 'showSyncSuccessToast' to ${successfulSyncs}`);
    }

    return { successful: successfulSyncs, failed: failedSyncs, total: totalToSync };
} // End forceSync