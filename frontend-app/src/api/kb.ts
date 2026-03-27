import client from './client';

export const listCollections = () => client.get('/kb/collections');

export const createCollection = (name: string, description: string, category = 'general', tags = '') =>
  client.post('/kb/collections', new URLSearchParams({ name, description, category, tags }));

export const deleteCollection = (id: number) => client.delete(`/kb/collections/${id}`);

export const listDocuments = (collectionId: number) => client.get(`/kb/collections/${collectionId}/documents`);

export const uploadDocument = (collectionId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post(`/kb/collections/${collectionId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteDocument = (id: number) => client.delete(`/kb/documents/${id}`);

export const searchKB = (query: string, collectionId?: number) =>
  client.post('/kb/search', new URLSearchParams({
    query,
    ...(collectionId ? { collection_id: String(collectionId) } : {}),
  }));
