import JSZip from 'jszip';
import { buildCollectionTree } from './collection-tree';
import { getCollection } from './db';

export async function exportCollectionZip(collectionId: string): Promise<void> {
  const collection = await getCollection(collectionId);
  if (!collection) throw new Error(`Collection ${collectionId} not found`);

  const tree = await buildCollectionTree(collection);
  const zip = new JSZip();
  for (const file of tree.files) {
    zip.file(file.path, file.blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(zipBlob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tree.rootFolder}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
