import { useEffect, useState, type FormEvent } from 'react';
import { request, type Note } from './api';

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request<Note[]>('/api/notes', { signal: controller.signal }).then(setNotes).catch(error => {
      if (!controller.signal.aborted) setError(String(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    setSaving(true); setError('');
    try {
      const note = await request<Note>('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      setNotes(current => [...current, note]); setText('');
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); }
  }
  return <main><p className="eyebrow">09 / BROWSER → API → NODE</p><h1>一条请求走过全栈</h1>
    <p>Vite 负责浏览器模块，Node HTTP 服务负责数据。笔记保存在内存，重启即重置。</p>
    <section><form onSubmit={addNote}><label htmlFor="note">新笔记</label>
      <input id="note" value={text} onChange={e => setText(e.target.value)} maxLength={120} required />
      <button disabled={saving || loading}>{saving ? '保存中…' : '保存到服务端'}</button>
    </form><p role="status">{loading ? '正在读取 API…' : `共 ${notes.length} 条笔记`}</p>
    {error ? <p role="alert" className="error">{error}</p> : null}
    <ul>{notes.map(note => <li key={note.id}>{note.text}</li>)}</ul></section>
    <p>在 Network 里查看 GET / POST /api/notes 的请求与响应。</p>
  </main>;
}
