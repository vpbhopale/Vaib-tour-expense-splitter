import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from "xlsx-js-style";
import { DownloadCloud, UploadCloud, LogIn, Camera, Trash2, Save, FolderOpen, UserPlus } from 'lucide-react';
import './styles.css';

const GOOGLE_CLIENT_ID = '282105844395-epunt5u5frakke1eukgtriun0hg8cn1e.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid profile email';

function uid(){ return 'id_' + Math.random().toString(36).slice(2,9); }

export default function App(){
  const [members, setMembers] = useState(() => JSON.parse(localStorage.getItem('es_members') || '[]'));
  const [expenses, setExpenses] = useState(() => JSON.parse(localStorage.getItem('es_expenses') || '[]'));
  const [signedIn, setSignedIn] = useState(false);
  const authRef = useRef(null);
  const [projectName, setProjectName] = useState(() => localStorage.getItem('es_projectName') || 'Vaib Trip');

  useEffect(()=>{ localStorage.setItem('es_members', JSON.stringify(members)); }, [members]);
  useEffect(()=>{ localStorage.setItem('es_expenses', JSON.stringify(expenses)); }, [expenses]);
  useEffect(()=>{ localStorage.setItem('es_projectName', projectName); }, [projectName]);

  // load Google Identity library for GSI token client
  useEffect(()=>{
    if(!window.google){
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; document.body.appendChild(s);
    }
  },[]);

  function addMember(){ setMembers(prev=> [...prev, {name:'', photo:''}]); }
  function removeMember(i){ setMembers(prev=> prev.filter((_,idx)=>idx!==i)); }
  function updateMember(i, patch){ setMembers(prev=> { const c=[...prev]; c[i] = {...c[i], ...patch}; return c; }); }

  function handlePhoto(i, f){ if(!f) return; const reader = new FileReader(); reader.onload = (ev)=>{ const img = new Image(); img.onload = ()=>{ const canvas = document.createElement('canvas'); const max=160; const scale = Math.min(max/img.width, max/img.height,1); canvas.width = img.width*scale; canvas.height = img.height*scale; const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,canvas.width,canvas.height); const data = canvas.toDataURL('image/jpeg',0.75); updateMember(i, {photo: data}); }; img.src = ev.target.result; }; reader.readAsDataURL(f); }

  // Google Drive sign in with token client (GSI)
  function handleGoogleSignIn(){ if(!window.google){ alert('Google API not ready. Try again in a moment.'); return; } const client = window.google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: (resp)=>{ if(resp && resp.access_token){ localStorage.setItem('es_gdrive_token', JSON.stringify(resp)); setSignedIn(true); alert('Signed in to Google Drive'); } } }); authRef.current = client; client.requestAccessToken(); }

  function signOutGoogle(){ localStorage.removeItem('es_gdrive_token'); setSignedIn(false); alert('Signed out'); }

  // Build workbook and upload to Drive
  async function uploadToDrive(){
    const token = JSON.parse(localStorage.getItem('es_gdrive_token') || 'null');
    if(!token || !token.access_token){ alert('Please sign in first'); return; }
    const wb = XLSX.utils.book_new();
    const expRows = expenses.map(e=>({Date:e.date, Description:e.desc, Category:e.cat, PaidBy: members[e.paidBy]?.name || '', Total: e.total, SplitSummary:(e.breakdown||[]).map((b,i)=> b? `${members[i]?.name}:${b}` : '').filter(Boolean).join(' | ')}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(members.map(m=>({Member:m.name, Photo: m.photo||''}))), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{meta:'Expense Splitter backup', project: projectName, created: new Date().toISOString()}]), 'Meta');
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([wbout], {type:'application/octet-stream'});
    const metadata = { name: (projectName || 'expense-splitter') + '-' + (new Date()).toISOString().slice(0,19).replace(/[:T]/g,'_') + '.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'})); form.append('file', blob);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method:'POST', headers: { Authorization: 'Bearer ' + token.access_token }, body: form });
    const j = await res.json();
    if(j && j.id) alert('Backup uploaded to Drive. File ID: ' + j.id); else alert('Upload failed');
  }

  async function downloadLastBackupFromDrive(){
    const token = JSON.parse(localStorage.getItem('es_gdrive_token') || 'null'); if(!token || !token.access_token){ alert('Please sign in first'); return; }
    const q = encodeURIComponent("name contains 'expense-splitter' or name contains 'Vaib'");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=5&fields=files(id,name,createdTime)`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token.access_token } });
    const j = await res.json();
    if(!j.files || j.files.length===0){ alert('No backups found in Drive'); return; }
    const file = j.files[0];
    const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: 'Bearer ' + token.access_token } });
    const arr = await dl.arrayBuffer(); const wb = XLSX.read(new Uint8Array(arr), {type:'array'});
    const expSheet = wb.Sheets['Expenses'] || wb.Sheets[wb.SheetNames[0]]; const expArr = XLSX.utils.sheet_to_json(expSheet);
    const membersSheet = wb.Sheets['Summary'] ? XLSX.utils.sheet_to_json(wb.Sheets['Summary']) : [];
    const importedMembers = membersSheet.map(r=> ({name: r.Member || 'Member', photo: r.Photo || ''}));
    setMembers(importedMembers);
    const mapped = expArr.map((r,idx)=> ({ id: 'imp'+idx, date:r.Date||'', desc:r.Description||'', cat:r.Category||'', paidBy: Math.max(0, importedMembers.findIndex(m=> m.name===r.PaidBy)), total: Number(r.Total)||0, breakdown: [] }));
    setExpenses(mapped);
    alert('Imported backup from Drive: ' + file.name);
  }

  // Save/Load project locally
  function saveProjectLocal(){
    if(!projectName){ alert('Enter project name first'); return; }
    const data = { members, expenses, projectName, savedAt: new Date().toISOString() };
    localStorage.setItem('vaib_project_' + projectName, JSON.stringify(data));
    alert('Project saved locally as: ' + projectName);
  }
  function loadProjectLocal(name){ const s = localStorage.getItem('vaib_project_' + name); if(!s){ alert('Project not found'); return; } const d = JSON.parse(s); setMembers(d.members||[]); setExpenses(d.expenses||[]); setProjectName(d.projectName||name); alert('Loaded ' + name); }

  // Simple sample expense add
  function addSampleExpense(){ if(members.length===0){ alert('Add members first'); return; } const total = 1200; const breakdown = Array(members.length).fill(+(total/members.length).toFixed(2)); const e = { id: uid(), date: (new Date()).toISOString().slice(0,10), desc: 'Sample expense', cat: 'Other', paidBy:0, total, splitType:'equal', breakdown }; setExpenses(prev=>[...prev,e]); }

  // Export local xlsx
  function exportLocal(){
    const wb = XLSX.utils.book_new();
    const expRows = expenses.map(e=>({Date:e.date, Description:e.desc, Category:e.cat, PaidBy: members[e.paidBy]?.name || '', Total: e.total, SplitSummary:(e.breakdown||[]).map((b,i)=> b? `${members[i]?.name}:${b}` : '').filter(Boolean).join(' | ')}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(members.map(m=>({Member:m.name, Photo:m.photo||''}))), 'Summary');
    const out = XLSX.write(wb,{bookType:'xlsx', type:'array'}); const blob = new Blob([out], {type:'application/octet-stream'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (projectName || 'expense-project') + '.xlsx'; a.click();
  }

  return (
    <div className="container">
      <div className="header-card mb-6">
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div className="logo-wrap"><img src="/logo.png" alt="VaiB" style={{width:64,height:64,borderRadius:12}}/></div>
          <div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:0.6,color:'#E6EEF9'}}>VaiB Designs — Expense Splitter</div>
            <div style={{color:'#9fdcff'}}>3D neon theme · PWA ready</div>
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {!signedIn ? <button className="glow-btn" onClick={handleGoogleSignIn}><LogIn size={14}/> Sign in (Drive)</button> :
            <>
              <button className="glow-btn" onClick={uploadToDrive}><UploadCloud size={14}/> Upload Backup</button>
              <button className="glow-btn" onClick={downloadLastBackupFromDrive}><DownloadCloud size={14}/> Download Backup</button>
              <button className="glow-btn" onClick={signOutGoogle}>Sign out</button>
            </>
          }
          <button className="glow-btn" onClick={exportLocal}>Export XLSX</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:20}}>
        <div className="card">
          <h3 style={{marginTop:0}}>Members</h3>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {members.map((m,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:44,height:44,borderRadius:10,overflow:'hidden',background:'#111',display:'flex',alignItems:'center',justifyContent:'center'}}>{m.photo? <img src={m.photo} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <div style={{color:'#6fb'}}> { (m.name || 'M')[0] } </div>}</div>
                <input value={m.name} onChange={e=> updateMember(i,{name:e.target.value})} placeholder="Member name" style={{flex:1,background:'transparent',border:'none',borderBottom:'1px solid rgba(255,255,255,0.06)',color:'#E6EEF9',padding:6}}/>
                <label style={{cursor:'pointer'}}><Camera size={16}/> <input type="file" accept="image/*" style={{display:'none'}} onChange={e=> handlePhoto(i, e.target.files[0])}/></label>
                <button style={{background:'transparent',border:'none',color:'#f66'}} onClick={()=> removeMember(i)}><Trash2 size={16}/></button>
              </div>
            ))}
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button className="glow-btn" onClick={addMember}><UserPlus size={14}/> Add Member</button>
              <button className="glow-btn" onClick={()=>{ setMembers([]); setExpenses([]); }}>Reset</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{marginTop:0}}>Expenses & Project</h3>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
            <input value={projectName} onChange={e=> setProjectName(e.target.value)} placeholder="Project name" style={{flex:1,padding:8,borderRadius:8,border:'1px solid rgba(255,255,255,0.06)'}}/>
            <button className="glow-btn" onClick={saveProjectLocal}><Save size={14}/> Save</button>
            <button className="glow-btn" onClick={()=>{ const name = prompt('Open project name:'); if(name) loadProjectLocal(name); }}><FolderOpen size={14}/> Open</button>
          </div>
          <div style={{marginBottom:12}}>
            <button className="glow-btn" onClick={addSampleExpense}>Add Sample Expense</button>
          </div>
          <div>
            {expenses.map((e,i)=>(
              <div key={e.id} style={{padding:10,marginBottom:8,background:'rgba(255,255,255,0.02)',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontWeight:600}}>{e.desc}</div>
                  <div style={{fontSize:12,color:'#9fdcff'}}>{e.date} · {e.cat}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:700}}>₹ {Number(e.total).toFixed(2)}</div>
                  <div style={{fontSize:12,color:'#9fdcff'}}>Paid by: {members[e.paidBy]?.name || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="footer">Created by Vaibhav Bhopale</div>
    </div>
  );
}
