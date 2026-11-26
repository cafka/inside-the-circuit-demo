import crypto from 'node:crypto';

export const libraryBlob = bytes => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

// Serve a separately reviewable integration patch. Never overwrite the pinned download.
export function applyLibraryPatch(bytes, patch, commit) {
  if (commit !== patch.baseCommit || libraryBlob(bytes) !== patch.baseBlob) throw Error('library_patch_base_mismatch');
  let text = bytes.toString('utf8');
  for (const {before, after} of patch.replacements) {
    if (!before || text.split(before).length !== 2) throw Error('library_patch_context_mismatch');
    text = text.replace(before, after);
  }
  const result = Buffer.from(text);
  if (libraryBlob(result) !== patch.patchedBlob) throw Error('library_patch_result_mismatch');
  return result;
}
