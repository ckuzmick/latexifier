// Minimal project file tree.
export default function Sidebar({ files, active, onOpen }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="logo">✦ Latexifier</span>
        <span className="project">sample-project</span>
      </div>
      <ul className="filelist">
        {files.map((f) => (
          <li key={f} className={f === active ? 'active' : ''} onClick={() => onOpen(f)}>
            <span className="file-icon">{f.endsWith('.tex') ? '𝐓' : '◦'}</span>
            <span className="file-name">{f}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
