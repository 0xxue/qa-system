import { useState, useEffect } from 'react';
import { listCollections, createCollection, deleteCollection, uploadDocument, listDocuments } from '../../api/kb';
import { Upload, Trash2, FileText, Plus, FolderOpen } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/Toast';
import type { KBCollection, KBDocument } from '../../types';

export default function KnowledgeBasePage() {
  const [collections, setCollections] = useState<KBCollection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    listCollections().then((data: any) => setCollections(data?.collections || data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedId) listDocuments(selectedId).then((data: any) => setDocs(data?.documents || data || [])).catch(() => setDocs([]));
  }, [selectedId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createCollection(newName, newDesc);
    setShowCreate(false); setNewName(''); setNewDesc('');
    listCollections().then(setCollections);
    toast('Collection created', 'success');
  };

  const handleDelete = async (id: number) => {
    await deleteCollection(id);
    if (selectedId === id) { setSelectedId(null); setDocs([]); }
    listCollections().then(setCollections);
    toast('Collection deleted', 'info');
  };

  const handleUpload = async (files: FileList) => {
    if (!selectedId) return;
    for (const file of Array.from(files)) {
      await uploadDocument(selectedId, file);
    }
    listDocuments(selectedId).then(setDocs);
    toast(`${files.length} file(s) uploaded`, 'success');
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: Collections */}
      <div className="kb-left" style={{
        width: 220, borderRight: '1.5px solid var(--line)',
        display: 'flex', flexDirection: 'column', background: 'rgba(232, 220, 200, 0.5)',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1.5px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="font-mono" style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)' }}>
            COLLECTIONS
          </span>
          <button
            onClick={() => setShowCreate(true)}
            style={{ width: 26, height: 26, border: '1.5px solid var(--line)', background: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={14} color="var(--orange)" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {collections.map(c => (
            <div
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="animate-slide-in"
              style={{
                padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                borderLeft: c.id === selectedId ? '3px solid var(--orange)' : '3px solid transparent',
                background: c.id === selectedId ? 'rgba(212, 82, 26, 0.08)' : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <FolderOpen size={16} color="var(--orange)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)' }}>{c.doc_count} docs</div>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Trash2 size={12} color="var(--dim)" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Documents */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedId ? (
          <>
            {/* Upload zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
              style={{
                margin: 16, padding: 20, border: '2px dashed var(--line)',
                textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file'; input.multiple = true;
                input.accept = '.pdf,.docx,.xlsx,.csv,.txt,.md';
                input.onchange = () => input.files && handleUpload(input.files);
                input.click();
              }}
            >
              <Upload size={20} color="var(--orange)" style={{ margin: '0 auto 8px' }} />
              <div className="font-mono" style={{ fontSize: 11, color: 'var(--mid)' }}>
                Drop files here or click to upload
              </div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginTop: 4 }}>
                PDF · DOCX · XLSX · CSV · TXT · MD
              </div>
            </div>

            {/* Document list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
              {docs.map(d => (
                <div key={d.id} className="animate-slide-in" style={{
                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid var(--line)',
                }}>
                  <FileText size={16} color="var(--orange)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.filename}</div>
                    <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
                      {d.chunk_count} chunks · {(d.file_size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <Badge color={d.status === 'ready' ? 'green' : d.status === 'failed' ? 'red' : 'orange'}>
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <FolderOpen size={40} color="var(--dim)" style={{ margin: '0 auto 12px' }} />
              <div className="font-mono" style={{ fontSize: 12, color: 'var(--dim)' }}>
                Select or create a knowledge base
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="NEW COLLECTION"
        actions={<>
          <Button variant="outline" onClick={() => setShowCreate(false)}>CANCEL</Button>
          <Button onClick={handleCreate}>CREATE</Button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input placeholder="Collection name" value={newName} onChange={e => setNewName(e.target.value)} />
          <Input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
