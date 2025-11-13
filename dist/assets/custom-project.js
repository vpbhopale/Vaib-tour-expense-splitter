
// custom-project.js - lightweight additions to enable project creation & expense splitting (localStorage)
(function(){
  function qs(sel, root=document){return root.querySelector(sel);}
  function qsa(sel, root=document){return Array.from(root.querySelectorAll(sel));}
  // UI helpers
  function createEl(tag, attrs={}, children=[]){
    const el = document.createElement(tag);
    for(const k in attrs){
      if(k==='class') el.className = attrs[k];
      else if(k==='html') el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    children.forEach(c => typeof c === 'string' ? el.appendChild(document.createTextNode(c)) : el.appendChild(c));
    return el;
  }

  // Inject styles for cards and modal
  const style = createEl('style',{html:`
  .vaib-floating-btn{position:fixed;right:16px;bottom:16px;background:#007bff;color:white;border-radius:999px;padding:14px 18px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer}
  .vaib-modal{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000}
  .vaib-modal .vaib-card{background:white;border-radius:12px;max-width:520px;width:92%;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,0.2);}
  .vaib-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:12px}
  .vaib-project-card{background:white;border-radius:12px;padding:12px;box-shadow:0 6px 18px rgba(0,0,0,0.08);min-height:120px;display:flex;flex-direction:column;justify-content:space-between}
  .vaib-small{font-size:12px;color:#666}
  .vaib-btn{padding:8px 10px;border-radius:8px;border:0;background:#0069d9;color:white;cursor:pointer}
  .vaib-input{width:100%;padding:8px;border-radius:8px;border:1px solid #ddd;margin:6px 0}
  @media(max-width:420px){ .vaib-cards{grid-template-columns:1fr} .vaib-modal .vaib-card{padding:12px} }
  `});
  document.head.appendChild(style);

  // Storage helpers
  const KEY = 'vaib_projects';
  function loadProjects(){ try{ return JSON.parse(localStorage.getItem(KEY) || '[]') }catch(e){return []} }
  function saveProjects(arr){ localStorage.setItem(KEY, JSON.stringify(arr)); }

  // Create floating button
  const floatBtn = createEl('button',{class:'vaib-floating-btn',type:'button'},['+ Create Project']);
  document.body.appendChild(floatBtn);

  // Modal builder
  function openModal(){
    const modal = createEl('div',{class:'vaib-modal'});
    const card = createEl('div',{class:'vaib-card'});
    modal.appendChild(card);
    card.appendChild(createEl('h3',{},['Create Project']));
    card.appendChild(createEl('p',{class:'vaib-small'},['Add a name and members (comma separated).']));
    const nameInput = createEl('input',{class:'vaib-input',placeholder:'Project name'});
    const membersInput = createEl('input',{class:'vaib-input',placeholder:'Members (comma separated) e.g. Alice,Bob'});
    card.appendChild(nameInput); card.appendChild(membersInput);

    const addExpensesBtn = createEl('button',{class:'vaib-btn'},['Add Expenses & Save']);
    const cancelBtn = createEl('button',{class:'vaib-btn',style:'background:#6c757d;margin-left:8px'},['Cancel']);
    const controls = createEl('div',{},[addExpensesBtn,cancelBtn]);
    card.appendChild(controls);

    // expense list UI
    const expensesList = createEl('div',{},[]);
    card.appendChild(createEl('h4',{},['Expenses']));
    card.appendChild(expensesList);
    const addExpenseLine = createEl('button',{class:'vaib-btn',style:'margin-top:8px;background:#28a745'},['+ Add Expense']);
    card.appendChild(addExpenseLine);

    function addExpenseRow(exp){
      const row = createEl('div',{style:'border:1px solid #eee;padding:8px;border-radius:8px;margin:6px 0;'});
      const title = createEl('input',{class:'vaib-input',placeholder:'Expense title',value:exp?.title||''});
      const amount = createEl('input',{class:'vaib-input',placeholder:'Amount',value:exp?.amount||'',type:'number'});
      const choice = createEl('select',{class:'vaib-input'},[
        createEl('option',{value:'equal'},['Equal']),
        createEl('option',{value:'custom'},['Custom'])
      ]);
      const contribsDiv = createEl('div',{},[]);
      function renderContribs(){
        contribsDiv.innerHTML='';
        const members = (membersInput.value||'').split(',').map(s=>s.trim()).filter(Boolean);
        if(choice.value==='equal'){
          contribsDiv.appendChild(createEl('div',{class:'vaib-small'},['Contributions will be split equally among: '+members.join(', ')]));
        } else {
          if(members.length===0){
            contribsDiv.appendChild(createEl('div',{class:'vaib-small'},['Enter members first to set custom contributions.']));
          } else {
            members.forEach(m => {
              const inp = createEl('input',{class:'vaib-input',placeholder:`Contribution for ${m}`,type:'number',value:exp?.contribs?.[m]||''});
              contribsDiv.appendChild(createEl('div',{},[createEl('label',{},[m]),inp]));
            });
          }
        }
      }
      choice.addEventListener('change',renderContribs);
      membersInput.addEventListener('input',renderContribs);
      row.appendChild(title); row.appendChild(amount); row.appendChild(choice); row.appendChild(contribsDiv);
      const del = createEl('button',{class:'vaib-btn',style:'background:#dc3545;margin-top:6px'},['Delete']);
      del.addEventListener('click',()=>{ row.remove(); });
      row.appendChild(del);
      expensesList.appendChild(row);
      renderContribs();
    }

    addExpenseLine.addEventListener('click',()=> addExpenseRow({}));
    addExpensesBtn.addEventListener('click',()=>{
      const name = nameInput.value.trim();
      const members = (membersInput.value||'').split(',').map(s=>s.trim()).filter(Boolean);
      if(!name){ alert('Please enter project name'); return; }
      // collect expenses
      const expenses = Array.from(expensesList.children).map(row=>{
        const t = row.querySelector('input[placeholder="Expense title"]')?.value || '';
        const amt = parseFloat(row.querySelector('input[type="number"]')?.value||0) || 0;
        const type = row.querySelector('select')?.value || 'equal';
        const contribs = {};
        if(type==='custom'){
          Array.from(row.querySelectorAll('input[type="number"]')).forEach((inp)=>{
            const label = inp.previousSibling ? inp.previousSibling.textContent : null;
            // fallback: use index
            const key = label || inp.placeholder || ('p'+Math.random().toString(36).slice(2,7));
            contribs[key] = parseFloat(inp.value||0) || 0;
          });
        }
        return {title:t, amount:amt, split:type, contribs};
      });
      const projects = loadProjects();
      projects.push({id:Date.now(), name, members, expenses, createdAt:new Date().toISOString()});
      saveProjects(projects);
      modal.remove();
      renderDashboard();
      alert('Project saved locally. To sync with Google Drive, export the data or enable Drive sync (not configured).');
    });

    cancelBtn.addEventListener('click',()=> modal.remove());
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  floatBtn.addEventListener('click', openModal);

  // Dashboard rendering - card based
  function renderDashboard(){
    // try to find a main content area
    let container = qs('.vaib-cards') || qs('#root') || qs('main') || qs('body');
    // if the container is body, append a small header
    if(container===document.body){
      // create a container
      const wrapper = createEl('div',{class:'vaib-cards',style:'padding-top:70px'});
      document.body.insertBefore(wrapper, document.body.firstChild);
      container = wrapper;
    } else {
      // ensure we have vaib-cards container
      let existing = qs('.vaib-cards');
      if(!existing){
        existing = createEl('div',{class:'vaib-cards'});
        container.insertBefore(existing, container.firstChild);
      }
      container = existing;
    }
    container.innerHTML='';
    const projects = loadProjects();
    if(projects.length===0){
      container.appendChild(createEl('div',{class:'vaib-small'},['No projects yet. Use the "Create Project" button to add one.']));
      return;
    }
    projects.forEach(p=>{
      const card = createEl('div',{class:'vaib-project-card'});
      card.appendChild(createEl('div',{},[createEl('strong',{},[p.name])]));
      card.appendChild(createEl('div',{class:'vaib-small'},[p.members.join(', ')]));
      const total = p.expenses.reduce((s,e)=>s+(e.amount||0),0);
      card.appendChild(createEl('div',{},[createEl('div',{},[`Total: ₹${total.toFixed(2)}`])]));
      const open = createEl('button',{class:'vaib-btn'},['Open']);
      open.addEventListener('click',()=> openProjectView(p.id));
      card.appendChild(open);
      container.appendChild(card);
    });
  }

  function openProjectView(id){
    const projects = loadProjects();
    const p = projects.find(x=>x.id===id);
    if(!p){ alert('Project not found'); return; }
    const modal = createEl('div',{class:'vaib-modal'});
    const card = createEl('div',{class:'vaib-card'});
    modal.appendChild(card);
    card.appendChild(createEl('h3',{},[p.name]));
    card.appendChild(createEl('div',{class:'vaib-small'},['Members: '+p.members.join(', ')]));
    const list = createEl('div',{},[]);
    p.expenses.forEach((e,idx)=>{
      const row = createEl('div',{style:'border-bottom:1px dashed #eee;padding:8px 0'});
      row.appendChild(createEl('div',{},[createEl('strong',{},[e.title || ('Expense '+(idx+1))])]));
      row.appendChild(createEl('div',{class:'vaib-small'},['Amount: ₹'+(e.amount||0)]));
      row.appendChild(createEl('div',{class:'vaib-small'},['Split: '+(e.split||'equal')]));
      // always ask equal or custom when viewing/adding new expense -- show a button to "Add new expense"
      list.appendChild(row);
    });
    card.appendChild(list);
    const addNew = createEl('button',{class:'vaib-btn'},['+ Add Expense']);
    addNew.addEventListener('click', ()=> {
      // prompt for equal or custom for this new expense
      const choice = prompt('Split type for this expense? Type "equal" or "custom"','equal');
      if(!choice) return;
      const title = prompt('Expense title','Lunch');
      const amount = parseFloat(prompt('Amount (numbers only)','0')||0) || 0;
      const newExpense = {title, amount, split: choice, contribs:{}};
      if(choice==='custom'){
        p.members.forEach(m=>{
          const val = parseFloat(prompt('Contribution for '+m,'0')||0) || 0;
          newExpense.contribs[m]=val;
        });
      }
      p.expenses.push(newExpense);
      // persist
      const projects = loadProjects();
      const idx = projects.findIndex(x=>x.id===p.id);
      if(idx>=0){ projects[idx]=p; saveProjects(projects); }
      modal.remove();
      openProjectView(p.id);
    });
    const close = createEl('button',{class:'vaib-btn',style:'background:#6c757d;margin-left:8px'},['Close']);
    close.addEventListener('click', ()=> modal.remove());
    card.appendChild(createEl('div',{},[addNew, close]));
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  // initial render
  document.addEventListener('DOMContentLoaded', renderDashboard);
  // in case DOM already loaded
  if(document.readyState==='complete' || document.readyState==='interactive') renderDashboard();

  // Expose a small helper for exporting projects
  window.vaibExportProjects = function(){
    const data = localStorage.getItem(KEY) || '[]';
    const blob = new Blob([data], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vaib_projects_export_'+(new Date().toISOString().slice(0,10))+'.json';
    a.click();
  };
})();
