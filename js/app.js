"use strict";

const MONTHS_PT = ["janeiro","fevereiro","março","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MONTHS_ORDER = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MONTHS_DISPLAY = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MANUAL_STORAGE_KEY = "databi_manual_entries_v1";
const GOALS_STORAGE_KEY = "databi_goals_v1";
const USERNAME_STORAGE_KEY = "databi_username_v1";
const CHART_PALETTE = ["#6366f1","#8b5cf6","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#f97316","#84cc16","#a855f7","#22d3ee"];

const ICON_UP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 19V5M12 5l-6 6M12 5l6 6"/></svg>';
const ICON_DOWN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M12 19l-6-6M12 19l6-6"/></svg>';

const state = {
  workbook:null, sheetNames:[], sheetName:null, rawGrid:[],
  headerRowIndex:0, headers:[], columnConfig:[],
  dataRows:[], // after header+fill, before unpivot
  unpivot:{enabled:false, valueCols:[], varName:"Período", valName:"Valor"},
  finalData:[], uploadedFinalData:[], manualEntries:[], mode:"file", columnTypes:{}, columnCardinality:{},
  filters:{}, search:"", sort:{col:null,dir:1}, page:1, pageSize:25,
  metricCol:null, dimCol:null, periodCol:null, numericCols:[], categoryCols:[], dateCols:[],
  dark:false, fileName:"", charts:{}, currentSection:"dashboard", timeChartType:"line", goals:[], userName:""
};

/* ---------------- Utilities ---------------- */
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function isBlank(v){return v===null||v===undefined||(typeof v==="string"&&v.trim()==="");}

function parseNumberFlexible(v){
  if(typeof v==="number") return isFinite(v)?v:null;
  if(v==null) return null;
  let s=String(v).trim();
  if(s==="") return null;
  s=s.replace(/[R$€£\s]/g,"");
  const hasComma=s.includes(","), hasDot=s.includes(".");
  if(hasComma&&hasDot){
    if(s.lastIndexOf(",")>s.lastIndexOf(".")){ s=s.replace(/\./g,"").replace(",",".");}
    else { s=s.replace(/,/g,""); }
  } else if(hasComma){ s=s.replace(",","."); }
  s=s.replace(/[^0-9.\-]/g,"");
  if(s===""||s==="-") return null;
  const n=parseFloat(s);
  return isFinite(n)?n:null;
}
function looksLikeDate(v){
  if(v instanceof Date) return !isNaN(v);
  if(typeof v==="string"){
    const s=v.trim();
    if(/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(s)) return true;
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  }
  return false;
}
function toDate(v){
  if(v instanceof Date) return v;
  if(typeof v==="string"){
    const s=v.trim();
    let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){ let y=+m[3]; if(y<100) y+=2000; return new Date(y, +m[2]-1, +m[1]); }
    m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  }
  return null;
}
function fmtNumber(n, opts){
  opts=opts||{};
  if(n==null||isNaN(n)) return "—";
  const abs=Math.abs(n);
  if(opts.compact && abs>=1000){
    return new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:1}).format(n);
  }
  return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
}
function fmtCurrency(n, compact){
  if(n==null||isNaN(n)) return "—";
  if(compact && Math.abs(n)>=1000){
    return "R$ "+new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:1}).format(n);
  }
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
}
function monthIndex(label){
  const l=String(label||"").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return MONTHS_ORDER.findIndex(m=>m.normalize("NFD").replace(/[\u0300-\u036f]/g,"")===l);
}

/* ---------------- App: núcleo (upload, configuração, dados, navegação) ---------------- */
const App = {
  init(){
    this.loadManualEntries();
    this.loadGoals();
    this.loadUserName();
    const mesSel=$("entryMes");
    if(mesSel){
      mesSel.innerHTML=MONTHS_DISPLAY.map(m=>`<option ${m===MONTHS_DISPLAY[new Date().getMonth()]?'selected':''}>${m}</option>`).join("");
      $("entryAno").value=new Date().getFullYear();
    }
    const dz=$("dropzone"), fi=$("fileInput");
    dz.addEventListener("click",()=>fi.click());
    ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("drag");}));
    ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("drag");}));
    dz.addEventListener("drop",e=>{ if(e.dataTransfer.files.length) this.loadFile(e.dataTransfer.files[0]); });
    fi.addEventListener("change",e=>{ if(e.target.files.length) this.loadFile(e.target.files[0]); });

    $("globalSearch").addEventListener("input",e=>{ state.search=e.target.value; state.page=1; this.renderTable(); });
    $("unpivotSwitch").addEventListener("click",()=>this.toggleUnpivot());

    document.addEventListener("keydown",e=>{ if(e.key==="/" && document.activeElement.tagName!=="INPUT"){ e.preventDefault(); $("globalSearch")?.focus(); }});
  },
  loadFile(file){
    state.fileName=file.name;
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=new Uint8Array(e.target.result);
        const wb=XLSX.read(data,{type:"array",cellDates:true});
        state.workbook=wb; state.sheetNames=wb.SheetNames;
        this.loadSheet(wb.SheetNames[0]);
        $("configFileLabel").textContent=file.name+" · "+wb.SheetNames.length+" aba(s)";
        $("uploadView").classList.add("hidden");
        $("configView").classList.remove("hidden");
        this.renderSheetTabs();
      }catch(err){
        alert("Não foi possível ler o arquivo. Verifique se é um Excel/CSV válido.\n\n"+err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },
  renderSheetTabs(){
    const wrap=$("sheetTabsWrap");
    if(state.sheetNames.length<=1){ wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");
    wrap.innerHTML='<div class="flex flex-wrap gap-2">'+state.sheetNames.map(n=>
      `<div class="chip ${n===state.sheetName?'active':''}" onclick="App.loadSheet('${esc(n).replace(/'/g,"\\'")}');App.renderSheetTabs();">${esc(n)}</div>`
    ).join("")+"</div>";
  },
  loadSheet(name){
    state.sheetName=name;
    const ws=state.workbook.Sheets[name];
    const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
    state.rawGrid=grid;
    state.headerRowIndex=this.detectHeaderRow(grid);
    this.buildHeaders();
    this.inferAllColumnTypes(true);
    this.renderHeaderPreview();
    this.renderColumnConfig();
    this.setupUnpivotSuggestion();
  },
  detectHeaderRow(grid){
    let best=0, bestScore=-1;
    const limit=Math.min(20,grid.length);
    for(let r=0;r<limit;r++){
      const row=grid[r]||[];
      let nonEmpty=0, textCells=0;
      row.forEach(c=>{
        if(!isBlank(c)){ nonEmpty++; if(typeof c==="string" && isNaN(parseNumberFlexible(c))) textCells++; }
      });
      const nextRow=grid[r+1]||[];
      const nextNonEmpty=nextRow.filter(c=>!isBlank(c)).length;
      let score=nonEmpty + textCells*0.8 + (nextNonEmpty>0?0.5:0);
      if(nonEmpty<2) score=-1;
      if(score>bestScore){ bestScore=score; best=r; }
    }
    return best;
  },
  buildHeaders(){
    const row=state.rawGrid[state.headerRowIndex]||[];
    const width=Math.max(row.length, ...state.rawGrid.slice(0,50).map(r=>r?r.length:0), 1);
    const seen={};
    const headers=[];
    for(let i=0;i<width;i++){
      let name=row[i];
      name=isBlank(name)?("Coluna "+(i+1)):String(name).trim();
      if(seen[name]!=null){ seen[name]++; name=name+" ("+seen[name]+")"; } else seen[name]=0;
      headers.push(name);
    }
    state.headers=headers;
    state.columnConfig=headers.map((name,idx)=>({index:idx,name,type:"texto",fill:false,use:true}));
  },
  inferAllColumnTypes(setDefaults){
    const dataStart=state.headerRowIndex+1;
    const sampleRows=state.rawGrid.slice(dataStart,dataStart+300);
    state.columnConfig.forEach(col=>{
      let numOk=0,dateOk=0,total=0; const vals=new Set();
      sampleRows.forEach(r=>{
        const v=r?r[col.index]:null;
        if(isBlank(v)) return;
        total++;
        if(v instanceof Date || looksLikeDate(v)) dateOk++;
        else if(parseNumberFlexible(v)!=null) numOk++;
        vals.add(String(v).trim().toLowerCase());
      });
      let type="texto";
      if(total>0){
        if(dateOk/total>0.6) type="data";
        else if(numOk/total>0.6) type="numero";
        else if(vals.size<=Math.max(20,total*0.5)) type="categoria";
      }
      if(setDefaults) col.type=type;
      col.blankRatio = sampleRows.length? 1-(total/sampleRows.length):0;
      col.cardinality = vals.size;
    });
  },
  renderHeaderPreview(){
    const rows=state.rawGrid.slice(0,15);
    const maxCols=Math.min(state.headers.length,12);
    let html="<thead><tr><th></th>"+Array.from({length:maxCols}).map((_,i)=>`<th>Col ${i+1}</th>`).join("")+"</tr></thead><tbody>";
    rows.forEach((row,ri)=>{
      const isHeader=ri===state.headerRowIndex;
      html+=`<tr onclick="App.setHeaderRow(${ri})" style="cursor:pointer;${isHeader?'background:var(--accent-soft);':''}">`;
      html+=`<td style="font-weight:700;color:${isHeader?'var(--accent)':'var(--muted)'};">${isHeader?'&#10003; ':''}${ri}</td>`;
      for(let c=0;c<maxCols;c++){
        let v=row?row[c]:null;
        if(v instanceof Date) v=v.toLocaleDateString("pt-BR");
        html+=`<td style="${isHeader?'font-weight:700;':''}max-width:140px;overflow:hidden;text-overflow:ellipsis;">${esc(v==null?"":v)}</td>`;
      }
      html+="</tr>";
    });
    html+="</tbody>";
    $("headerPreviewTable").innerHTML=html;
  },
  setHeaderRow(idx){
    state.headerRowIndex=idx;
    this.buildHeaders();
    this.inferAllColumnTypes(true);
    this.renderHeaderPreview();
    this.renderColumnConfig();
    this.setupUnpivotSuggestion();
  },
  renderColumnConfig(){
    const list=$("columnConfigList");
    list.innerHTML=state.columnConfig.map(col=>{
      const badge={numero:'badge-num',data:'badge-date',categoria:'badge-cat',texto:'badge-txt'}[col.type];
      const badgeLabel={numero:'123 Número',data:'📅 Data',categoria:'🏷 Categoria',texto:'Aa Texto'}[col.type];
      return `<div class="panel-soft p-2.5 flex items-center gap-2">
        <input type="checkbox" ${col.use?"checked":""} onchange="App.updateColConfig(${col.index},'use',this.checked)" title="Incluir coluna">
        <input type="text" class="input" style="padding:.3rem .5rem;font-size:.78rem;flex:1;min-width:0;" value="${esc(col.name)}" onchange="App.updateColConfig(${col.index},'name',this.value)">
        <select class="input" style="width:auto;padding:.3rem .4rem;font-size:.72rem;" onchange="App.updateColConfig(${col.index},'type',this.value)">
          <option value="numero" ${col.type==='numero'?'selected':''}>Número</option>
          <option value="data" ${col.type==='data'?'selected':''}>Data</option>
          <option value="categoria" ${col.type==='categoria'?'selected':''}>Categoria</option>
          <option value="texto" ${col.type==='texto'?'selected':''}>Texto</option>
        </select>
        <label class="flex items-center gap-1 text-xs text-muted" title="Preencher células vazias para baixo (útil para colunas de grupo mescladas)">
          <input type="checkbox" ${col.fill?"checked":""} onchange="App.updateColConfig(${col.index},'fill',this.checked)">↓fill
        </label>
      </div>`;
    }).join("");
  },
  updateColConfig(idx,field,value){
    const col=state.columnConfig.find(c=>c.index===idx);
    if(!col) return;
    col[field]=value;
    if(field==="type") this.setupUnpivotSuggestion();
  },
  setupUnpivotSuggestion(){
    const monthCols=state.columnConfig.filter(c=>monthIndex(c.name)>=0);
    state.unpivot.valueCols = monthCols.map(c=>c.index);
    state.unpivot.enabled = monthCols.length>=3;
    $("unpivotValueCols").innerHTML = state.columnConfig.filter(c=>c.type==="numero"||monthIndex(c.name)>=0).map(c=>{
      const active=state.unpivot.valueCols.includes(c.index);
      return `<div class="chip ${active?'active':''}" onclick="App.toggleUnpivotCol(${c.index})">${esc(c.name)}</div>`;
    }).join("") || '<span class="text-muted text-xs">Nenhuma coluna numérica encontrada.</span>';
    $("unpivotSwitch").classList.toggle("on",state.unpivot.enabled);
    $("unpivotStatusLabel").textContent = state.unpivot.enabled?"ativado":"desativado";
    $("unpivotBody").classList.toggle("hidden",!state.unpivot.enabled);
  },
  toggleUnpivotCol(idx){
    const i=state.unpivot.valueCols.indexOf(idx);
    if(i>=0) state.unpivot.valueCols.splice(i,1); else state.unpivot.valueCols.push(idx);
    this.setupUnpivotSuggestion.call(this);
    // re-render chips only, keep switch state
    $("unpivotValueCols").innerHTML = state.columnConfig.filter(c=>c.type==="numero"||monthIndex(c.name)>=0).map(c=>{
      const active=state.unpivot.valueCols.includes(c.index);
      return `<div class="chip ${active?'active':''}" onclick="App.toggleUnpivotCol(${c.index})">${esc(c.name)}</div>`;
    }).join("");
  },
  toggleUnpivot(){
    state.unpivot.enabled=!state.unpivot.enabled;
    $("unpivotSwitch").classList.toggle("on",state.unpivot.enabled);
    $("unpivotStatusLabel").textContent = state.unpivot.enabled?"ativado":"desativado";
    $("unpivotBody").classList.toggle("hidden",!state.unpivot.enabled);
  },
  backToUpload(){
    $("configView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("uploadView").classList.remove("hidden");
    $("fileInput").value="";
    $("fileNameLabel").textContent="";
  },
  goConfig(){
    $("appView").classList.add("hidden");
    $("configView").classList.remove("hidden");
  },

  /* ---------------- Build dataset ---------------- */
  buildDataRows(){
    const cfg=state.columnConfig;
    const dataStart=state.headerRowIndex+1;
    const rows=state.rawGrid.slice(dataStart);
    const fillMemory={};
    const out=[];
    rows.forEach(r=>{
      if(!r || r.every(c=>isBlank(c))) return;
      const obj={};
      let hasAny=false;
      cfg.forEach(col=>{
        if(!col.use) return;
        let v=r[col.index];
        if(isBlank(v) && col.fill && fillMemory[col.index]!==undefined){ v=fillMemory[col.index]; }
        if(!isBlank(v)){ fillMemory[col.index]=v; hasAny=true; }
        obj[col.name]=v;
      });
      if(hasAny) out.push(obj);
    });
    state.dataRows=out;
  },
  applyUnpivot(){
    const cfg=state.columnConfig.filter(c=>c.use);
    if(!state.unpivot.enabled || state.unpivot.valueCols.length===0){
      state.finalData=state.dataRows.slice();
      return;
    }
    const valueColNames = state.columnConfig.filter(c=>state.unpivot.valueCols.includes(c.index)).map(c=>c.name);
    const idColNames = cfg.map(c=>c.name).filter(n=>!valueColNames.includes(n));
    const varName=state.unpivot.varName||"Período", valName=state.unpivot.valName||"Valor";
    const out=[];
    state.dataRows.forEach(row=>{
      valueColNames.forEach(vc=>{
        const raw=row[vc];
        const num=parseNumberFlexible(raw);
        if(num==null || num===0) { if(num==null) return; }
        const newRow={};
        idColNames.forEach(n=>newRow[n]=row[n]);
        newRow[varName]=vc;
        newRow[valName]=num;
        out.push(newRow);
      });
    });
    state.finalData=out;
  },
  computeFinalColumnTypes(){
    const cols={}, card={};
    const sample=state.finalData;
    const headerSet=new Set();
    sample.forEach(r=>Object.keys(r).forEach(k=>headerSet.add(k)));
    headerSet.forEach(name=>{
      let numOk=0,dateOk=0,total=0; const vals=new Set();
      sample.forEach(r=>{
        const v=r[name];
        if(isBlank(v)) return;
        total++;
        if(v instanceof Date || looksLikeDate(v)) dateOk++;
        else if(parseNumberFlexible(v)!=null) numOk++;
        vals.add(String(v).trim());
      });
      let type="texto";
      if(total>0){
        if(dateOk/total>0.6) type="data";
        else if(numOk/total>0.6) type="numero";
        else if(vals.size<=Math.max(30,total*0.6)) type="categoria";
      }
      // Manual override from column config wins if name matches an original (non-unpivoted) column
      const manual = state.columnConfig.find(c=>c.name===name && c.use);
      if(manual && !state.unpivot.enabled) type=manual.type;
      cols[name]=type; card[name]=vals.size;
    });
    state.columnTypes=cols; state.columnCardinality=card;
    state.numericCols=Object.keys(cols).filter(k=>cols[k]==="numero");
    state.categoryCols=Object.keys(cols).filter(k=>cols[k]==="categoria"||cols[k]==="texto");
    state.dateCols=Object.keys(cols).filter(k=>cols[k]==="data");
  },
  chooseDefaults(){
    // metric: numeric col with largest sum of abs values
    let best=null,bestSum=-1;
    state.numericCols.forEach(c=>{
      let s=0; state.finalData.forEach(r=>{const n=parseNumberFlexible(r[c]); if(n!=null) s+=Math.abs(n);});
      if(s>bestSum){bestSum=s;best=c;}
    });
    state.metricCol=best || state.numericCols[0] || null;

    // period col: prefer unpivoted var name, else a date column, else a category col with month names
    if(state.unpivot.enabled && state.unpivot.valName && state.columnTypes[state.unpivot.varName]!==undefined){
      state.periodCol=state.unpivot.varName;
    } else if(state.dateCols.length){
      state.periodCol=state.dateCols[0];
    } else {
      const monthLike=state.categoryCols.find(c=>{
        const vals=new Set(state.finalData.map(r=>String(r[c]||"").toLowerCase()));
        let hits=0; vals.forEach(v=>{if(monthIndex(v)>=0) hits++;});
        return hits>=2;
      });
      state.periodCol=monthLike||null;
    }

    // dimension col: category column (not period) with cardinality between 2 and 40, prefer highest
    let bestDim=null,bestCard=-1;
    state.categoryCols.forEach(c=>{
      if(c===state.periodCol) return;
      const card=state.columnCardinality[c]||0;
      if(card>=2 && card<=60 && card>bestCard){bestCard=card;bestDim=c;}
    });
    state.dimCol=bestDim || state.categoryCols.find(c=>c!==state.periodCol) || null;
  },

  /* ---------------- Generate dashboard ---------------- */
  generateDashboard(){
    try{
      if(!state.columnConfig.some(c=>c.use)){ alert("Selecione ao menos uma coluna."); return; }
      state.unpivot.varName=$("unpivotVarName").value.trim()||"Período";
      state.unpivot.valName=$("unpivotValName").value.trim()||"Valor";
      this.buildDataRows();
      this.applyUnpivot();
      if(state.finalData.length===0){ alert("Nenhum dado válido encontrado com essa configuração. Ajuste o cabeçalho ou as colunas."); return; }
      state.mode="file";
      this.computeFinalColumnTypes();
      this.chooseDefaults();
      state.uploadedFinalData=state.finalData.slice();
      this.mergeManualEntries();
      state.filters={}; state.search=""; state.page=1; state.sort={col:null,dir:1};

      $("configView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      $("sidebarFileName").textContent=state.fileName;

      this.populateSelectors();
      this.goSection("dashboard");
    }catch(err){
      console.error("Erro ao gerar dashboard:", err);
      alert("Ocorreu um erro ao gerar o dashboard: "+err.message+"\n\nAbra o console do navegador (F12) para mais detalhes.");
    }
  },
  populateSelectors(){
    const metricSel=$("metricSelect");
    metricSel.innerHTML=state.numericCols.map(c=>`<option value="${esc(c)}" ${c===state.metricCol?'selected':''}>${esc(c)}</option>`).join("");
    const dimSel=$("rankDimSelect");
    dimSel.innerHTML=state.categoryCols.map(c=>`<option value="${esc(c)}" ${c===state.dimCol?'selected':''}>${esc(c)}</option>`).join("");
    const dimSel2=$("dimSelectDashboard");
    if(dimSel2) dimSel2.innerHTML=state.categoryCols.map(c=>`<option value="${esc(c)}" ${c===state.dimCol?'selected':''}>${esc(c)}</option>`).join("");
    const periodOptions=[...new Set([...state.dateCols,...state.categoryCols])];
    const periodSel=$("periodSelectDashboard");
    if(periodSel) periodSel.innerHTML='<option value="">(nenhum)</option>'+periodOptions.map(c=>`<option value="${esc(c)}" ${c===state.periodCol?'selected':''}>${esc(c)}</option>`).join("");
  },
  onMetricChange(v){ state.metricCol=v; this.renderAll(); },
  onDimChange(v){ state.dimCol=v; const lbl=$("rankDimLabel"); if(lbl) lbl.textContent=v; this.populateSelectors(); this.renderAll(); },
  onPeriodChange(v){ state.periodCol=v||null; this.renderAll(); },

  /* ---------------- Navigation ---------------- */
  goSection(sec){
    state.currentSection=sec;
    ["dashboard","table","analysis","entries","goals"].forEach(s=>{
      $("section-"+s).classList.toggle("hidden", s!==sec);
    });
    document.querySelectorAll(".sidebar-link[data-section]").forEach(el=>{
      el.classList.toggle("active", el.dataset.section===sec);
    });
    const titles={dashboard:"Visão geral",table:"Tabela dinâmica",analysis:"Comparativos & Ranking",entries:"Lançamentos",goals:"Metas"};
    $("pageTitle").textContent=titles[sec];
    this.toggleSidebar(false);
    this.renderAll();
  },
  toggleSidebar(open){
    $("sidebar").classList.toggle("open",!!open);
    $("sidebarOverlay").classList.toggle("open",!!open);
  },
  toggleDark(){
    state.dark=!state.dark;
    document.documentElement.classList.toggle("dark",state.dark);
    $("darkSwitch").classList.toggle("on",state.dark);
    this.renderAll();
  },

  /* ---------------- Filtering ---------------- */
  getFilteredData(){
    let rows=state.finalData;
    const search=state.search.trim().toLowerCase();
    if(search){
      rows=rows.filter(r=>Object.values(r).some(v=>String(v==null?"":v).toLowerCase().includes(search)));
    }
    Object.entries(state.filters).forEach(([col,f])=>{
      if(!f) return;
      if(f.type==="set" && f.values && f.values.size>0){
        rows=rows.filter(r=>f.values.has(String(r[col])));
      }
      if(f.type==="range"){
        rows=rows.filter(r=>{
          const n=parseNumberFlexible(r[col]);
          if(n==null) return false;
          if(f.min!=null && n<f.min) return false;
          if(f.max!=null && n>f.max) return false;
          return true;
        });
      }
    });
    return rows;
  },
  renderFiltersBar(targetId){
    const cols=state.categoryCols.slice(0,6);
    const el=$(targetId);
    if(!el) return;
    el.innerHTML = cols.map(c=>{
      const active=state.filters[c] && state.filters[c].values && state.filters[c].values.size>0;
      return `<div class="relative">
        <button class="btn btn-sm ${active?'btn-primary':''}" onclick="App.toggleFilterPopover('${targetId}','${esc(c).replace(/'/g,"\\'")}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>
          ${esc(c)} ${active?`(${state.filters[c].values.size})`:''}
        </button>
        <div id="pop-${targetId}-${c.replace(/[^a-zA-Z0-9]/g,'_')}" class="hidden absolute z-30 mt-1 card p-2" style="min-width:200px;max-height:260px;overflow:auto;"></div>
      </div>`;
    }).join("") + (Object.values(state.filters).some(f=>f&&f.values&&f.values.size>0) ? `<button class="btn btn-sm btn-danger" onclick="App.clearFilters()">Limpar filtros</button>` : "");
  },
  toggleFilterPopover(targetId,col){
    const safeId="pop-"+targetId+"-"+col.replace(/[^a-zA-Z0-9]/g,'_');
    const pop=$(safeId);
    const isOpen=!pop.classList.contains("hidden");
    document.querySelectorAll('[id^="pop-"]').forEach(p=>p.classList.add("hidden"));
    if(isOpen) return;
    const values=[...new Set(state.finalData.map(r=>r[col]).filter(v=>!isBlank(v)))].sort();
    const current=state.filters[col]?.values || new Set();
    pop.innerHTML = `<input class="input mb-2" style="padding:.3rem .5rem;font-size:.75rem;" placeholder="Filtrar..." oninput="App.filterPopoverSearch(this,'${safeId}')">` +
      values.map(v=>`<label class="flex items-center gap-2 text-xs py-1 popover-opt"><input type="checkbox" ${current.has(String(v))?'checked':''} onchange="App.toggleFilterValue('${col.replace(/'/g,"\\'")}','${String(v).replace(/'/g,"\\'")}')">${esc(v)}</label>`).join("");
    pop.classList.remove("hidden");
  },
  filterPopoverSearch(input,popId){
    const q=input.value.toLowerCase();
    $(popId).querySelectorAll(".popover-opt").forEach(l=>{
      l.style.display = l.textContent.toLowerCase().includes(q)?"":"none";
    });
  },
  toggleFilterValue(col,val){
    if(!state.filters[col]) state.filters[col]={type:"set",values:new Set()};
    const set=state.filters[col].values;
    if(set.has(val)) set.delete(val); else set.add(val);
    state.page=1;
    this.renderAll();
  },
  clearFilters(){ state.filters={}; state.page=1; this.renderAll(); },

  /* ---------------- KPIs ---------------- */
  sortBy(col){
    if(state.sort.col===col) state.sort.dir*=-1; else { state.sort.col=col; state.sort.dir=1; }
    this.renderTable();
  },
  gotoPage(p){ state.page=p; this.renderTable(); },
  setPageSize(v){ state.pageSize=parseInt(v,10); state.page=1; this.renderTable(); },

  /* ---------------- Export ---------------- */
  exportExcel(){
    const rows=this.getFilteredData();
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Dados filtrados");
    const kpiRows=[
      {Indicador:"Total "+state.metricCol, Valor: rows.reduce((a,r)=>a+(parseNumberFlexible(r[state.metricCol])||0),0)},
      {Indicador:"Registros", Valor: rows.length}
    ];
    const ws2=XLSX.utils.json_to_sheet(kpiRows);
    XLSX.utils.book_append_sheet(wb,ws2,"Resumo KPIs");
    XLSX.writeFile(wb, (state.fileName.replace(/\.[^.]+$/,"")||"dashboard")+"_export.xlsx");
  },

  /* ---------------- Manual entries (Lançamentos) ---------------- */
  loadManualEntries(){
    try{
      const raw=localStorage.getItem(MANUAL_STORAGE_KEY);
      state.manualEntries = raw? JSON.parse(raw) : [];
    }catch(e){ state.manualEntries=[]; }
  },
  saveManualEntries(){
    try{ localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(state.manualEntries)); }catch(e){ /* best effort */ }
  },
  startManualMode(){
    state.mode="manual";
    state.fileName="Lançamentos manuais";
    state.metricCol="Valor"; state.periodCol="Mês"; state.dimCol="Item";
    state.numericCols=["Valor"]; state.dateCols=[];
    state.categoryCols=["Tipo","Categoria","Subcategoria","Item","Mês"];
    state.columnTypes={Tipo:"categoria",Categoria:"categoria",Subcategoria:"categoria",Item:"categoria",Mês:"categoria",Ano:"categoria",Valor:"numero"};
    state.columnCardinality={};
    state.uploadedFinalData=[];
    state.filters={}; state.search=""; state.page=1; state.sort={col:null,dir:1};
    this.mergeManualEntries();

    $("uploadView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    $("sidebarFileName").textContent=state.fileName;
    this.populateSelectors();
    this.goSection("entries");
  },
  mapManualEntry(e){
    const row={};
    row["Tipo"]=e.tipo;
    row["Categoria"]=e.categoria;
    row["Subcategoria"]=e.subcategoria;
    row["Item"]=e.item;
    row[state.periodCol||"Mês"]=e.mes;
    row["Ano"]=e.ano;
    row[state.metricCol||"Valor"]=e.valor;
    return row;
  },
  mergeManualEntries(){
    const mapped=state.manualEntries.map(e=>this.mapManualEntry(e));
    state.finalData=state.uploadedFinalData.concat(mapped);
    this.computeFinalColumnTypes();
  },
  addManualEntry(evt){
    evt.preventDefault();
    const entry={
      tipo: $("entryTipo").value,
      categoria: $("entryCategoria").value.trim(),
      subcategoria: $("entrySubcategoria").value.trim(),
      item: $("entryItem").value.trim(),
      mes: $("entryMes").value,
      ano: parseInt($("entryAno").value,10) || new Date().getFullYear(),
      valor: parseNumberFlexible($("entryValor").value)
    };
    if(!entry.item || entry.valor==null || entry.valor<=0){ alert("Preencha ao menos Item/Descrição e um Valor válido."); return; }
    state.manualEntries.push(entry);
    this.saveManualEntries();
    this.mergeManualEntries();
    this.populateSelectors();
    $("entryItem").value=""; $("entrySubcategoria").value=""; $("entryValor").value="";
    $("entryItem").focus();
    this.renderEntriesSection();
    this.renderAll();
  },
  deleteManualEntry(idx){
    state.manualEntries.splice(idx,1);
    this.saveManualEntries();
    this.mergeManualEntries();
    this.populateSelectors();
    this.renderEntriesSection();
    this.renderAll();
  },
  loadGoals(){
    try{
      const raw=localStorage.getItem(GOALS_STORAGE_KEY);
      state.goals = raw? JSON.parse(raw) : [];
    }catch(e){ state.goals=[]; }
  },
  saveGoals(){
    try{ localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(state.goals)); }catch(e){ /* best effort */ }
  },
  addGoal(evt){
    evt.preventDefault();
    const nome=$("goalNome").value.trim();
    const valorTotal=parseNumberFlexible($("goalValorTotal").value);
    const valorAtual=parseNumberFlexible($("goalValorAtual").value) || 0;
    const dataLimite=$("goalDataLimite").value;
    if(!nome || valorTotal==null || valorTotal<=0 || !dataLimite){
      alert("Preencha nome, valor total e data limite corretamente.");
      return;
    }
    state.goals.push({
      id: "g"+Date.now()+Math.random().toString(36).slice(2,7),
      nome, valorTotal, valorAtual: Math.max(0,valorAtual), dataLimite
    });
    this.saveGoals();
    $("goalForm").reset();
    $("goalValorAtual").value="0";
    this.renderGoals();
  },
  deleteGoal(id){
    if(!confirm("Excluir esta meta? Essa ação não pode ser desfeita.")) return;
    state.goals = state.goals.filter(g=>g.id!==id);
    this.saveGoals();
    this.renderGoals();
  },
  updateGoalValue(id){
    const input=$("goalUpdate_"+id);
    if(!input) return;
    const novoValor=parseNumberFlexible(input.value);
    if(novoValor==null || novoValor<0){ alert("Informe um valor válido."); return; }
    const g=state.goals.find(g=>g.id===id);
    if(!g) return;
    g.valorAtual=novoValor;
    this.saveGoals();
    this.renderGoals();
  },
  computeGoalStatus(g){
    if(g.valorAtual>=g.valorTotal) return "Concluída";
    const today=new Date(); today.setHours(0,0,0,0);
    const limite=toDate(g.dataLimite) || new Date(g.dataLimite+"T00:00:00");
    if(limite && limite<today) return "Atrasada";
    return "Em andamento";
  },
  loadUserName(){
    try{ state.userName = localStorage.getItem(USERNAME_STORAGE_KEY) || ""; }catch(e){ state.userName=""; }
  },
  saveUserName(){
    try{ localStorage.setItem(USERNAME_STORAGE_KEY, state.userName||""); }catch(e){ /* best effort */ }
  },
  promptUserName(){
    const val=prompt("Como podemos te chamar?", state.userName||"");
    if(val!=null){
      state.userName=val.trim();
      this.saveUserName();
      this.renderVisaoGeral();
    }
  },
};

window.addEventListener("click",(e)=>{
  if(!e.target.closest('[id^="pop-"]') && !e.target.closest('button')){
    document.querySelectorAll('[id^="pop-"]').forEach(p=>p.classList.add("hidden"));
  }
});
