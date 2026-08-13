"use strict";

/* ---------------- App: Visão Geral, Diagnóstico, Metas, Comparativos, Tabela, Lançamentos ---------------- */
Object.assign(App, {
  renderKPIs(){
    const rows=this.getFilteredData();
    const m=state.metricCol;
    const vals=rows.map(r=>parseNumberFlexible(r[m])).filter(v=>v!=null);
    const total=vals.reduce((a,b)=>a+b,0);
    const avg=vals.length?total/vals.length:0;
    const max=vals.length?Math.max(...vals):0;
    const count=rows.length;

    let deltaHtml="";
    if(state.periodCol){
      const byPeriod=this.groupSum(rows,state.periodCol,m);
      const ordered=this.orderPeriods(Object.keys(byPeriod));
      if(ordered.length>=2){
        const last=byPeriod[ordered[ordered.length-1]], prev=byPeriod[ordered[ordered.length-2]];
        const delta = prev!==0 ? ((last-prev)/Math.abs(prev))*100 : (last>0?100:0);
        const up=delta>=0;
        deltaHtml=`<div class="flex items-center gap-1 text-xs font-bold mt-1" style="color:${up?'var(--success)':'var(--danger)'};">${up?ICON_UP:ICON_DOWN} ${Math.abs(delta).toFixed(1)}% vs período anterior</div>`;
      }
    }

    const cards=[
      {label:"Total — "+m, value:fmtCurrency(total,true), sub:deltaHtml, icon:"💰", color:"var(--accent)"},
      {label:"Média por registro", value:fmtCurrency(avg,true), sub:"", icon:"📊", color:"var(--info)"},
      {label:"Maior valor", value:fmtCurrency(max,true), sub:"", icon:"⬆", color:"var(--success)"},
      {label:"Registros", value:count.toLocaleString("pt-BR"), sub:(state.dimCol?this.columnCardText():""), icon:"📋", color:"var(--warning)"},
    ];
    $("kpiGrid").innerHTML=cards.map(c=>`
      <div class="card p-4">
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <div class="text-xs text-muted font-semibold truncate">${esc(c.label)}</div>
            <div class="text-xl md:text-2xl font-extrabold mt-1 truncate">${c.value}</div>
            ${c.sub}
          </div>
          <div class="kpi-icon" style="background:${c.color}22;font-size:1.1rem;">${c.icon}</div>
        </div>
      </div>`).join("");
  },
  columnCardText(){
    const n=state.columnCardinality[state.dimCol]||0;
    return `<div class="text-xs text-muted mt-1">${n} categorias em ${esc(state.dimCol)}</div>`;
  },
  groupSum(rows,groupCol,metricCol){
    const out={};
    rows.forEach(r=>{
      const key=isBlank(r[groupCol])?"(vazio)":String(r[groupCol]);
      const n=parseNumberFlexible(r[metricCol]);
      if(n==null) return;
      out[key]=(out[key]||0)+n;
    });
    return out;
  },
  orderPeriods(keys){
    const withMonth=keys.every(k=>monthIndex(k)>=0);
    if(withMonth) return keys.slice().sort((a,b)=>monthIndex(a)-monthIndex(b));
    const asDates=keys.map(k=>({k,d:toDate(k)}));
    if(asDates.every(x=>x.d)) return asDates.sort((a,b)=>a.d-b.d).map(x=>x.k);
    return keys.slice().sort();
  },

  /* ---------------- Charts ---------------- */
  destroyChart(id){ if(state.charts[id]){ state.charts[id].destroy(); delete state.charts[id]; } },
  chartTextColor(){ return getComputedStyle(document.documentElement).getPropertyValue(state.dark?'--text':'--text').trim()||'#333'; },
  chartGridColor(){ return state.dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)'; },
  renderMiniRanking(){
    const rows=this.getFilteredData();
    if(!state.dimCol){ $("miniRanking").innerHTML='<div class="text-muted text-sm">Nenhuma coluna de categoria detectada.</div>'; return; }
    const grouped=this.groupSum(rows,state.dimCol,state.metricCol);
    const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const max=entries.length?entries[0][1]:1;
    const total=Object.values(grouped).reduce((a,b)=>a+b,0)||1;
    $("miniRanking").innerHTML= entries.length? entries.map((e,i)=>`
      <div class="flex items-center gap-2">
        <div class="w-5 text-xs font-bold text-muted">${i+1}</div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between text-xs mb-0.5"><span class="truncate font-medium">${esc(e[0])}</span><span class="text-muted">${fmtCurrency(e[1],true)} · ${(e[1]/total*100).toFixed(1)}%</span></div>
          <div class="h-1.5 rounded-full" style="background:var(--bg-soft);"><div class="h-1.5 rounded-full" style="width:${Math.max(4,(e[1]/max*100))}%;background:${CHART_PALETTE[i%CHART_PALETTE.length]};"></div></div>
        </div>
      </div>`).join("") : '<div class="text-muted text-sm">Sem dados no período/filtro atual.</div>';
  },

  /* ---------------- Analysis section ---------------- */
  renderAnalysis(){
    const rows=this.getFilteredData();
    $("rankDimLabel").textContent=state.dimCol||"";
    if(!state.periodCol){
      $("comparisonCards").innerHTML='<div class="text-muted text-sm col-span-3">Nenhuma coluna de período detectada para comparativos.</div>';
      this.destroyChart("chartComparison");
    } else {
      const grouped=this.groupSum(rows,state.periodCol,state.metricCol);
      const ordered=this.orderPeriods(Object.keys(grouped));
      const last=ordered[ordered.length-1], prev=ordered[ordered.length-2];
      const lastVal=grouped[last]||0, prevVal=prev!=null?(grouped[prev]||0):null;
      const delta = prevVal!=null && prevVal!==0 ? ((lastVal-prevVal)/Math.abs(prevVal))*100 : null;
      const totalAll = ordered.reduce((a,k)=>a+grouped[k],0);
      const avgAll = ordered.length? totalAll/ordered.length : 0;
      const cards=[
        {label:"Período atual ("+esc(last||"—")+")", value:fmtCurrency(lastVal,true), color:"var(--accent)"},
        {label:"Período anterior ("+esc(prev||"—")+")", value: prevVal!=null?fmtCurrency(prevVal,true):"—", color:"var(--muted)"},
        {label:"Variação", value: delta!=null? (delta>=0?"+":"")+delta.toFixed(1)+"%" : "—", color: delta!=null&&delta<0?"var(--danger)":"var(--success)"}
      ];
      $("comparisonCards").innerHTML=cards.map(c=>`<div class="card p-4"><div class="text-xs text-muted font-semibold">${c.label}</div><div class="text-2xl font-extrabold mt-1" style="color:${c.color}">${c.value}</div></div>`).join("");

      this.destroyChart("chartComparison");
      const ctx=document.getElementById("chartComparison");
      if(ctx){
        const last6=ordered.slice(-6);
        const textColor=this.chartTextColor(), grid=this.chartGridColor();
        state.charts.chartComparison=new Chart(ctx,{
          type:"bar",
          data:{labels:last6,datasets:[{label:state.metricCol,data:last6.map(k=>grouped[k]),
            backgroundColor:last6.map((k,i)=> i===last6.length-1?"#6366f1": i===last6.length-2?"#a5b4fc":"#c7d2fe"),
            borderRadius:8,maxBarThickness:52}]},
          options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtCurrency(c.parsed.y)}}},
            scales:{x:{ticks:{color:textColor},grid:{display:false}},y:{ticks:{color:textColor,callback:v=>fmtCurrency(v,true)},grid:{color:grid}}}}
        });
      }
    }

    if(!state.dimCol){ $("fullRanking").innerHTML='<div class="text-muted text-sm">Nenhuma coluna de categoria detectada.</div>'; return; }
    const grouped2=this.groupSum(rows,state.dimCol,state.metricCol);
    const entries=Object.entries(grouped2).sort((a,b)=>b[1]-a[1]);
    const max=entries.length?entries[0][1]:1;
    const totalAllEntries=entries.reduce((a,e)=>a+e[1],0)||1;
    const medals=["🥇","🥈","🥉"];
    $("fullRanking").innerHTML= entries.length? entries.map((e,i)=>`
      <div class="flex items-center gap-3 py-1.5">
        <div class="w-7 text-center text-sm">${medals[i]||("#"+(i+1))}</div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between text-sm mb-1"><span class="truncate font-semibold">${esc(e[0])}</span><span class="text-muted">${fmtCurrency(e[1])} · ${(e[1]/totalAllEntries*100).toFixed(1)}%</span></div>
          <div class="h-2 rounded-full" style="background:var(--bg-soft);"><div class="h-2 rounded-full" style="width:${Math.max(3,(e[1]/max*100))}%;background:linear-gradient(90deg,var(--accent),var(--accent-2));"></div></div>
        </div>
      </div>`).join("") : '<div class="text-muted text-sm">Sem dados no período/filtro atual.</div>';
  },

  /* ---------------- Table ---------------- */
  renderTable(){
    const allCols=Object.keys(state.columnTypes);
    let rows=this.getFilteredData();
    if(state.sort.col){
      const col=state.sort.col, dir=state.sort.dir, type=state.columnTypes[col];
      rows=rows.slice().sort((a,b)=>{
        let av=a[col], bv=b[col];
        if(type==="numero"){ av=parseNumberFlexible(av)??-Infinity; bv=parseNumberFlexible(bv)??-Infinity; return (av-bv)*dir; }
        av=String(av==null?"":av); bv=String(bv==null?"":bv);
        return av.localeCompare(bv,"pt-BR")*dir;
      });
    }
    const total=rows.length;
    const pages=Math.max(1,Math.ceil(total/state.pageSize));
    state.page=Math.min(state.page,pages);
    const startI=(state.page-1)*state.pageSize;
    const pageRows=rows.slice(startI,startI+state.pageSize);

    let thead="<thead><tr>"+allCols.map(c=>{
      const arrow = state.sort.col===c ? (state.sort.dir===1?" ▲":" ▼") : "";
      return `<th onclick="App.sortBy('${c.replace(/'/g,"\\'")}')">${esc(c)}${arrow}</th>`;
    }).join("")+"</tr></thead>";
    let tbody="<tbody>"+pageRows.map(r=>"<tr>"+allCols.map(c=>{
      let v=r[c];
      if(v instanceof Date) v=v.toLocaleDateString("pt-BR");
      else if(state.columnTypes[c]==="numero" && v!=null && v!=="") v=fmtNumber(parseNumberFlexible(v));
      return `<td>${esc(v==null?"":v)}</td>`;
    }).join("")+"</tr>").join("")+"</tbody>";
    $("dataTable").innerHTML=thead+tbody;

    $("tableSummary").textContent = total.toLocaleString("pt-BR")+" registro(s) encontrados";
    $("paginationInfo").textContent = total===0?"0 de 0": `${startI+1}–${Math.min(startI+state.pageSize,total)} de ${total}`;
    $("paginationControls").innerHTML = `
      <button class="btn btn-sm" ${state.page<=1?'disabled':''} onclick="App.gotoPage(${state.page-1})">‹</button>
      <span class="text-xs px-2">${state.page} / ${pages}</span>
      <button class="btn btn-sm" ${state.page>=pages?'disabled':''} onclick="App.gotoPage(${state.page+1})">›</button>`;
  },
  renderEntriesSection(){
    $("entryMergeHint").textContent = state.mode==="manual"
      ? "Estes lançamentos formam todo o seu dashboard."
      : `Serão somados aos dados importados (chave "${state.periodCol||'Mês'}" / "${state.metricCol||'Valor'}").`;

    const mesesUsados=[...new Set(state.manualEntries.map(e=>e.mes))];
    const anosUsados=[...new Set(state.manualEntries.map(e=>e.ano))].sort();
    const mesSel=$("entryFilterMes"), anoSel=$("entryFilterAno");
    const curMes=mesSel.value||"Todos", curAno=anoSel.value||"Todos";
    mesSel.innerHTML='<option value="Todos">Todos os meses</option>'+MONTHS_DISPLAY.filter(m=>mesesUsados.includes(m)).map(m=>`<option ${m===curMes?'selected':''}>${m}</option>`).join("");
    anoSel.innerHTML='<option value="Todos">Todos os anos</option>'+anosUsados.map(a=>`<option ${String(a)===curAno?'selected':''}>${a}</option>`).join("");

    let rows=state.manualEntries.map((e,i)=>({...e,_idx:i}));
    if(curMes!=="Todos") rows=rows.filter(r=>r.mes===curMes);
    if(curAno!=="Todos") rows=rows.filter(r=>String(r.ano)===curAno);

    const totals={"Receita":0,"Investimento":0,"Gasto Fixo":0,"Gasto Variável":0,"Extra":0,"Outro":0};
    rows.forEach(r=>{ if(totals[r.tipo]==null) totals[r.tipo]=0; totals[r.tipo]+=r.valor; });
    const gastos = (totals["Gasto Fixo"]||0)+(totals["Gasto Variável"]||0)+(totals["Extra"]||0)+(totals["Outro"]||0);
    const saldo = (totals["Receita"]||0) - gastos;

    const cards=[
      {label:"Receitas", value:totals["Receita"]||0, color:"var(--success)"},
      {label:"Investimentos", value:totals["Investimento"]||0, color:"var(--info)"},
      {label:"Gastos Fixos", value:totals["Gasto Fixo"]||0, color:"var(--warning)"},
      {label:"Gastos Variáveis", value:totals["Gasto Variável"]||0, color:"var(--warning)"},
      {label:"Extras/Outros", value:(totals["Extra"]||0)+(totals["Outro"]||0), color:"var(--danger)"},
      {label:"Saldo do período", value:saldo, color: saldo>=0?"var(--success)":"var(--danger)"}
    ];
    $("entrySummaryGrid").innerHTML=cards.map(c=>`
      <div class="card p-3">
        <div class="text-xs text-muted font-semibold truncate">${c.label}</div>
        <div class="text-lg font-extrabold mt-1" style="color:${c.color}">${fmtCurrency(c.value,true)}</div>
      </div>`).join("");

    $("entryCount").textContent=rows.length;
    const cols=["Tipo","Categoria","Subcategoria","Item","Mês","Ano","Valor",""];
    let thead="<thead><tr>"+cols.map(c=>`<th>${esc(c)}</th>`).join("")+"</tr></thead>";
    let tbody="<tbody>"+rows.slice().reverse().map(r=>`<tr>
        <td>${esc(r.tipo)}</td><td>${esc(r.categoria)}</td><td>${esc(r.subcategoria)}</td>
        <td>${esc(r.item)}</td><td>${esc(r.mes)}</td><td>${esc(r.ano)}</td>
        <td>${fmtCurrency(r.valor)}</td>
        <td>
          <button class="btn btn-sm" title="Editar lançamento" onclick="App.startEditManualEntry('${r.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-sm btn-danger" onclick="App.deleteManualEntry(${r._idx})">Excluir</button>
        </td>
      </tr>`).join("")+"</tbody>";
    $("entriesTable").innerHTML=thead+(rows.length?tbody:"<tbody><tr><td colspan='8' class='text-center text-muted py-4'>Nenhum lançamento ainda.</td></tr></tbody>");
  },

  /* ---------------- Goals (Metas) ---------------- */
  renderGoals(){
    const grid=$("goalsGrid");
    const goals=state.goals.slice().sort((a,b)=>new Date(a.dataLimite)-new Date(b.dataLimite));

    // Summary cards
    const totalMetas=goals.length;
    const concluidas=goals.filter(g=>this.computeGoalStatus(g)==="Concluída").length;
    const atrasadas=goals.filter(g=>this.computeGoalStatus(g)==="Atrasada").length;
    const totalJuntado=goals.reduce((a,g)=>a+g.valorAtual,0);
    $("goalsSummaryGrid").innerHTML=`
      <div class="card p-3"><div class="text-xs text-muted font-semibold">Total de metas</div><div class="text-xl font-extrabold mt-1">${totalMetas}</div></div>
      <div class="card p-3"><div class="text-xs text-muted font-semibold">Concluídas</div><div class="text-xl font-extrabold mt-1" style="color:var(--success)">${concluidas}</div></div>
      <div class="card p-3"><div class="text-xs text-muted font-semibold">Atrasadas</div><div class="text-xl font-extrabold mt-1" style="color:var(--danger)">${atrasadas}</div></div>
      <div class="card p-3"><div class="text-xs text-muted font-semibold">Total já juntado</div><div class="text-xl font-extrabold mt-1" style="color:var(--accent)">${fmtCurrency(totalJuntado,true)}</div></div>`;

    if(!goals.length){
      grid.innerHTML='<div class="card p-8 text-center text-muted md:col-span-2 xl:col-span-3">Nenhuma meta cadastrada ainda. Use o formulário acima para começar.</div>';
      return;
    }

    const statusStyle={
      "Concluída":{color:"var(--success)",bg:"var(--success-soft)"},
      "Em andamento":{color:"var(--info)",bg:"var(--accent-soft)"},
      "Atrasada":{color:"var(--danger)",bg:"var(--danger-soft)"}
    };

    grid.innerHTML=goals.map(g=>{
      const falta=Math.max(0,g.valorTotal-g.valorAtual);
      const pct=g.valorTotal>0? Math.min(100,(g.valorAtual/g.valorTotal*100)) : 0;
      const status=this.computeGoalStatus(g);
      const st=statusStyle[status];
      const dataFmt = (toDate(g.dataLimite)||new Date(g.dataLimite+"T00:00:00")).toLocaleDateString("pt-BR");
      return `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-2 mb-2">
          <h4 class="font-bold text-sm leading-snug">${esc(g.nome)}</h4>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span class="badge" style="background:${st.bg};color:${st.color};">${status}</span>
            <button class="btn btn-ghost btn-sm" title="Editar meta" onclick="App.editGoal('${g.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm btn-danger" title="Excluir meta" onclick="App.deleteGoal('${g.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
            </button>
          </div>
        </div>

        <div class="flex items-end justify-between mb-1">
          <div>
            <div class="text-xs text-muted">Juntado</div>
            <div class="text-lg font-extrabold" style="color:var(--accent)">${fmtCurrency(g.valorAtual,true)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted">Meta</div>
            <div class="text-sm font-bold">${fmtCurrency(g.valorTotal,true)}</div>
          </div>
        </div>

        <div class="h-2.5 rounded-full mb-1" style="background:var(--bg-soft);">
          <div class="h-2.5 rounded-full" style="width:${Math.max(3,pct)}%;background:linear-gradient(90deg,var(--accent),var(--accent-2));"></div>
        </div>
        <div class="flex justify-between text-xs text-muted mb-3">
          <span>${pct.toFixed(1)}% concluído</span>
          <span>Falta ${fmtCurrency(falta,true)}</span>
        </div>

        <div class="text-xs text-muted mb-3">Prazo: <span class="font-semibold" style="color:var(--text)">${dataFmt}</span></div>

        <div class="flex items-center gap-2 pt-3 border-t border-base">
          <input id="goalUpdate_${g.id}" type="number" step="0.01" min="0" class="input" style="padding:.4rem .6rem;font-size:.78rem;" placeholder="Novo valor juntado" value="${g.valorAtual}">
          <button class="btn btn-sm" onclick="App.updateGoalValue('${g.id}')">Atualizar</button>
        </div>
      </div>`;
    }).join("");
  },

  /* ---------------- Diagnóstico Financeiro (novo — apenas adição) ---------------- */

  // Detecta uma coluna de "tipo" (Receita/Gasto/Investimento...) entre as categorias já existentes.
  // Não cria nenhuma categoria nova — apenas identifica se uma coluna já existente serve para separar entradas de saídas.
  findTipoColumn(){
    const KEYWORDS=/receita|entrada|gasto|despesa|sa[ií]da|investimento/i;
    if(state.columnTypes && state.columnTypes["Tipo"]) return "Tipo"; // coluna fixa usada pelos Lançamentos manuais
    let found=null;
    (state.categoryCols||[]).forEach(col=>{
      if(found) return;
      if(/^tipo$/i.test(col) || /^grupo$/i.test(col)){ found=col; return; }
    });
    if(found) return found;
    (state.categoryCols||[]).forEach(col=>{
      if(found) return;
      const valores=new Set(state.finalData.map(r=>String(r[col]||"").toLowerCase()));
      let hits=0; valores.forEach(v=>{ if(KEYWORDS.test(v)) hits++; });
      if(hits>=1 && valores.size<=15) found=col;
    });
    return found;
  },

  // Classifica uma linha como 'entrada' ou 'saida'. Nunca marca uma receita como saída.
  classifyRow(r, tipoCol){
    if(tipoCol){
      const v=String(r[tipoCol]||"").toLowerCase();
      if(/receita|entrada/.test(v)) return "entrada";
      if(/gasto|despesa|sa[ií]da|investimento|extra|outro|fixo|vari[aá]vel/.test(v)) return "saida";
      // valor de tipo não reconhecido: cai no fallback pelo sinal do valor
    }
    const n=parseNumberFlexible(r[state.metricCol]);
    if(n==null || n===0) return null;
    return n>0 ? "entrada" : "saida";
  },
  renderDiagnostico(){
    const entEl=$("diagnosticoCardsEntrada"), saiEl=$("diagnosticoCardsSaida");
    const insightsEl=$("diagnosticoInsights"), alertasEl=$("diagnosticoAlertas");
    const emptyEl=$("chartDiagnosticoEmpty"), canvasEl=$("chartDiagnostico");
    if(!entEl || !saiEl) return; // bloco não presente nesta versão da página

    if(!state.dimCol){
      entEl.innerHTML='<div class="text-muted text-sm md:col-span-2">Nenhuma coluna de categoria detectada.</div>';
      saiEl.innerHTML=""; insightsEl.innerHTML=""; alertasEl.innerHTML="";
      this.destroyChart("chartDiagnostico");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      return;
    }

    const rows=this.getFilteredData();
    const tipoCol=this.findTipoColumn();

    const rowsEntrada=[], rowsSaida=[];
    rows.forEach(r=>{
      const tipo=this.classifyRow(r,tipoCol);
      if(tipo==="entrada") rowsEntrada.push(r);
      else if(tipo==="saida") rowsSaida.push(r);
    });

    const groupAbs=(rs)=>{
      const out={};
      rs.forEach(r=>{
        const key=isBlank(r[state.dimCol])?"(vazio)":String(r[state.dimCol]);
        const n=parseNumberFlexible(r[state.metricCol]);
        if(n==null) return;
        out[key]=(out[key]||0)+Math.abs(n);
      });
      return out;
    };

    const groupedEntrada=groupAbs(rowsEntrada);
    const groupedSaida=groupAbs(rowsSaida);
    const entriesEntrada=Object.entries(groupedEntrada).sort((a,b)=>b[1]-a[1]);
    const entriesSaida=Object.entries(groupedSaida).sort((a,b)=>b[1]-a[1]);
    const totalEntrada=entriesEntrada.reduce((a,e)=>a+e[1],0);
    const totalSaida=entriesSaida.reduce((a,e)=>a+e[1],0);

    if(!entriesEntrada.length && !entriesSaida.length){
      entEl.innerHTML='<div class="text-muted text-sm md:col-span-2">Sem entradas no período/filtro atual.</div>';
      saiEl.innerHTML='<div class="text-muted text-sm md:col-span-2">Sem saídas no período/filtro atual.</div>';
      insightsEl.innerHTML=""; alertasEl.innerHTML="";
      this.destroyChart("chartDiagnostico");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      return;
    }

    /* ---------- ENTRADAS ---------- */
    if(entriesEntrada.length){
      const maiorEntrada=entriesEntrada[0];
      const shareMaiorEntrada= totalEntrada>0? (maiorEntrada[1]/totalEntrada*100) : 0;
      entEl.innerHTML=`
        <div class="card p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs text-muted font-semibold truncate">Maior entrada</div>
              <div class="text-base font-extrabold mt-1 truncate" style="color:var(--success)">${esc(maiorEntrada[0])}</div>
              <div class="text-xs text-muted mt-0.5 truncate">${fmtCurrency(maiorEntrada[1],true)}</div>
            </div>
            <div class="kpi-icon" style="width:34px;height:34px;background:var(--success-soft);font-size:1rem;">💰</div>
          </div>
        </div>
        <div class="card p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs text-muted font-semibold truncate">Categoria que mais traz dinheiro</div>
              <div class="text-base font-extrabold mt-1 truncate" style="color:var(--success)">${esc(maiorEntrada[0])}</div>
              <div class="text-xs text-muted mt-0.5 truncate">${shareMaiorEntrada.toFixed(1)}% de todas as entradas</div>
            </div>
            <div class="kpi-icon" style="width:34px;height:34px;background:var(--success-soft);font-size:1rem;">📈</div>
          </div>
        </div>`;
    } else {
      entEl.innerHTML='<div class="text-muted text-sm md:col-span-2">Nenhuma entrada (receita) encontrada no período/filtro atual.</div>';
    }

    /* ---------- SAÍDAS ---------- */
    let maiorGasto=null, economizar=[], abaixoMedia=[], top3ShareSaida=0, avgSaida=0, acimaDoNormal=[];
    if(entriesSaida.length){
      avgSaida = totalSaida/entriesSaida.length;
      maiorGasto = entriesSaida[0];
      economizar = entriesSaida.slice(1,3); // 2ª e 3ª maiores saídas — candidatas a corte
      abaixoMedia = entriesSaida.filter(e=>e[1] < avgSaida*0.7).slice(-2);
      top3ShareSaida = totalSaida>0? entriesSaida.slice(0,3).reduce((a,e)=>a+e[1],0)/totalSaida*100 : 0;

      // "Acima do normal": valor do último período vs média histórica da própria categoria (somente saídas)
      if(state.periodCol){
        const porCategoriaPeriodo={};
        rowsSaida.forEach(r=>{
          const cat=isBlank(r[state.dimCol])?"(vazio)":String(r[state.dimCol]);
          const per=isBlank(r[state.periodCol])?"(vazio)":String(r[state.periodCol]);
          const val=parseNumberFlexible(r[state.metricCol]);
          if(val==null) return;
          (porCategoriaPeriodo[cat]=porCategoriaPeriodo[cat]||{}) [per] = (porCategoriaPeriodo[cat][per]||0)+Math.abs(val);
        });
        Object.entries(porCategoriaPeriodo).forEach(([cat,periodos])=>{
          const periodosOrdenados=this.orderPeriods(Object.keys(periodos));
          if(periodosOrdenados.length<2) return;
          const ultimo=periodos[periodosOrdenados[periodosOrdenados.length-1]];
          const mediaHistorica=Object.values(periodos).reduce((a,b)=>a+b,0)/periodosOrdenados.length;
          if(mediaHistorica>0 && ultimo > mediaHistorica*1.25){
            acimaDoNormal.push({cat, ultimo, mediaHistorica, variacao:(ultimo/mediaHistorica-1)*100});
          }
        });
        acimaDoNormal.sort((a,b)=>b.variacao-a.variacao);
      } else {
        acimaDoNormal = entriesSaida.filter(e=>e[1] > avgSaida*1.5).slice(0,3).map(e=>({cat:e[0], ultimo:e[1], mediaHistorica:avgSaida, variacao:(e[1]/avgSaida-1)*100}));
      }

      saiEl.innerHTML=`
        <div class="card p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs text-muted font-semibold truncate">Maior gasto</div>
              <div class="text-base font-extrabold mt-1 truncate" style="color:var(--danger)">${esc(maiorGasto[0])}</div>
              <div class="text-xs text-muted mt-0.5 truncate">${fmtCurrency(maiorGasto[1],true)}</div>
            </div>
            <div class="kpi-icon" style="width:34px;height:34px;background:var(--danger-soft);font-size:1rem;">🔥</div>
          </div>
        </div>
        <div class="card p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs text-muted font-semibold truncate">Onde economizar</div>
              <div class="text-base font-extrabold mt-1 truncate" style="color:var(--info)">${economizar.length? esc(economizar.map(e=>e[0]).join(" / ")) : "—"}</div>
              <div class="text-xs text-muted mt-0.5 truncate">${economizar.length? fmtCurrency(economizar.reduce((a,e)=>a+e[1],0),true) : ""}</div>
            </div>
            <div class="kpi-icon" style="width:34px;height:34px;background:var(--accent-soft);font-size:1rem;">✂️</div>
          </div>
        </div>`;
    } else {
      saiEl.innerHTML='<div class="text-muted text-sm md:col-span-2">Nenhuma saída (gasto) encontrada no período/filtro atual.</div>';
    }

    /* ---------- INSIGHTS (texto automático) ---------- */
    const insights=[];
    if(entriesEntrada.length){
      const maiorEntrada=entriesEntrada[0];
      insights.push(`Sua maior fonte de receita foi <b>${esc(maiorEntrada[0])}</b> (${fmtCurrency(maiorEntrada[1])}), a categoria que mais trouxe dinheiro ao caixa.`);
    }
    if(maiorGasto){
      insights.push(`Seu maior gasto foi <b>${esc(maiorGasto[0])}</b>, representando <b>${(maiorGasto[1]/totalSaida*100).toFixed(1)}%</b> das saídas (${fmtCurrency(maiorGasto[1])}).`);
    }
    if(economizar.length){
      insights.push(`Você pode economizar em <b>${esc(economizar.map(e=>e[0]).join(" e "))}</b> — juntas somam ${fmtCurrency(economizar.reduce((a,e)=>a+e[1],0))} em saídas.`);
    }
    if(abaixoMedia.length){
      insights.push(`<b>${esc(abaixoMedia.map(e=>e[0]).join(" e "))}</b> ${abaixoMedia.length>1?"estão":"está"} abaixo da média das categorias de gasto — bom sinal de controle nessa área.`);
    }
    if(entriesEntrada.length && entriesSaida.length){
      const saldo=totalEntrada-totalSaida;
      insights.push(saldo>=0
        ? `Suas entradas superam as saídas em <b>${fmtCurrency(saldo)}</b> no período/filtro atual.`
        : `Suas saídas superam as entradas em <b>${fmtCurrency(Math.abs(saldo))}</b> no período/filtro atual — atenção ao saldo.`);
    }
    insightsEl.innerHTML= insights.length? insights.map(t=>`
      <div class="flex items-start gap-2 text-sm panel-soft p-2.5">
        <span style="flex-shrink:0;">💡</span><span>${t}</span>
      </div>`).join("") : '<div class="text-muted text-sm">Sem dados suficientes para gerar insights.</div>';

    /* ---------- ALERTAS (somente sobre saídas — nunca sobre receitas) ---------- */
    const alertas=[];
    if(top3ShareSaida>60){
      alertas.push(`Atenção: suas 3 maiores categorias de gasto concentram mais de <b>${top3ShareSaida.toFixed(0)}%</b> das saídas — pouca diversificação.`);
    }
    acimaDoNormal.slice(0,3).forEach(a=>{
      alertas.push(`<b>${esc(a.cat)}</b> está <b>${a.variacao.toFixed(0)}% acima</b> do seu histórico de gastos neste período.`);
    });
    alertasEl.innerHTML = alertas.length? alertas.map(t=>`
      <div class="flex items-start gap-2 text-sm p-2.5 rounded-xl" style="background:var(--danger-soft);color:var(--danger);border:1px solid var(--danger);">
        <span style="flex-shrink:0;">⚠️</span><span>${t}</span>
      </div>`).join("") : `<div class="flex items-start gap-2 text-sm p-2.5 rounded-xl" style="background:var(--success-soft);color:var(--success);border:1px solid var(--success);"><span>✅</span><span>Nenhum alerta — seus gastos estão dentro do padrão habitual.</span></div>`;

    /* ---------- Gráfico de concentração (Top 5 SAÍDAS apenas) ---------- */
    if(!entriesSaida.length){
      this.destroyChart("chartDiagnostico");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if(canvasEl) canvasEl.classList.remove("hidden");
    if(emptyEl) emptyEl.classList.add("hidden");
    const top5=entriesSaida.slice(0,5);
    this.destroyChart("chartDiagnostico");
    const ctx=document.getElementById("chartDiagnostico");
    if(!ctx) return;
    const textColor=this.chartTextColor();
    state.charts.chartDiagnostico=new Chart(ctx,{
      type:"doughnut",
      data:{labels:top5.map(e=>e[0]+" ("+(e[1]/totalSaida*100).toFixed(0)+"%)"),
        datasets:[{data:top5.map(e=>e[1]),backgroundColor:CHART_PALETTE,borderWidth:2,borderColor:state.dark?'#111a2e':'#fff'}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:"55%",
        plugins:{legend:{position:"bottom",labels:{color:textColor,boxWidth:9,font:{size:9}}},
          tooltip:{callbacks:{label:c=>c.label.replace(/\s*\([^)]*\)$/,"")+": "+fmtCurrency(c.parsed)+" ("+(c.parsed/totalSaida*100).toFixed(1)+"%)"}}}
      }
    });
  },

  /* ================= VISÃO GERAL — FinPilot BI v1.1 (novo — apenas adição) =================
     Reutiliza: findTipoColumn(), classifyRow(), groupSum(), orderPeriods(), computeGoalStatus(),
     fmtCurrency(), esc(), parseNumberFlexible(), toDate(), chartTextColor(), CHART_PALETTE.
     Não altera nenhuma função/seção existente. ============================================= */

  cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },

  // Todos os períodos existentes no dataset completo, em ordem cronológica (reutiliza orderPeriods())
  getAllPeriodsOrdered(){
    if(!state.periodCol) return [];
    const keys=[...new Set(state.finalData.map(r=>String(r[state.periodCol])).filter(v=>v && v!=="null" && v!=="undefined" && v!=="(vazio)"))];
    return this.orderPeriods(keys);
  },
  // Linhas do dataset completo (ignora filtros ativos — a Visão Geral sempre reflete a situação real)
  getPeriodRows(periodValue){
    if(!state.periodCol || periodValue==null) return state.finalData;
    return state.finalData.filter(r=>String(r[state.periodCol])===String(periodValue));
  },
  // Reutiliza findTipoColumn()/classifyRow() (já usados no Diagnóstico Financeiro) para separar entradas de saídas
  splitEntradaSaida(rows){
    const tipoCol=this.findTipoColumn();
    const entrada=[], saida=[];
    rows.forEach(r=>{
      const t=this.classifyRow(r,tipoCol);
      if(t==="entrada") entrada.push(r);
      else if(t==="saida") saida.push(r);
    });
    return {entrada,saida};
  },
  sumAbs(rows){
    return rows.reduce((a,r)=>{ const n=parseNumberFlexible(r[state.metricCol]); return a+(n==null?0:Math.abs(n)); },0);
  },
  groupAbsBy(rows,col){
    const out={};
    rows.forEach(r=>{
      const key=isBlank(r[col])?"(vazio)":String(r[col]);
      const n=parseNumberFlexible(r[state.metricCol]);
      if(n==null) return;
      out[key]=(out[key]||0)+Math.abs(n);
    });
    return out;
  },

  // Regra simples de projeção (sem IA): se existir uma coluna de data real dentro do mês atual do calendário,
  // extrapola linearmente pelos dias já passados; senão, considera o período como já fechado.
  computeProjecaoFimMes(saldoAtual, mesAtualKey){
    try{
      const hoje=new Date();
      const dateCol = state.dateCols && state.dateCols[0];
      if(dateCol && mesAtualKey!=null){
        const rowsMes=this.getPeriodRows(mesAtualKey);
        const datas=rowsMes.map(r=>toDate(r[dateCol])).filter(d=>d && !isNaN(d));
        if(datas.length){
          const anoRef=datas[0].getFullYear(), mesRef=datas[0].getMonth();
          if(anoRef===hoje.getFullYear() && mesRef===hoje.getMonth()){
            const diasNoMes=new Date(anoRef,mesRef+1,0).getDate();
            const diasDecorridos=Math.max(1,hoje.getDate());
            const fracao=diasDecorridos/diasNoMes;
            if(fracao>0.05 && fracao<1) return saldoAtual/fracao;
          }
        }
      }
    }catch(e){ /* mantém fallback abaixo */ }
    return saldoAtual;
  },

  // Regra simples (sem IA): saldo do mês menos a reserva mensal necessária para as metas em andamento
  computeDisponibilidadeHoje(saldoAtual, metasAtivas){
    const hoje=new Date(); hoje.setHours(0,0,0,0);
    let reservaMetas=0;
    metasAtivas.forEach(g=>{
      const falta=Math.max(0,g.valorTotal-g.valorAtual);
      const limite=toDate(g.dataLimite)||new Date(g.dataLimite+"T00:00:00");
      const meses=Math.max(1, Math.round((limite-hoje)/(1000*60*60*24*30)));
      reservaMetas += falta/meses;
    });
    const disponivel=Math.max(0, saldoAtual-reservaMetas);
    const diasNoMes=new Date(hoje.getFullYear(),hoje.getMonth()+1,0).getDate();
    const diasRestantes=Math.max(1, diasNoMes-hoje.getDate()+1);
    return { disponivel, porDia: disponivel/diasRestantes };
  },

  // Média histórica de saldo mensal (receitas - despesas), usada como "ritmo de economia" nas previsões simples
  computeMediaEconomiaMensal(periods){
    if(!periods || periods.length<2) return null;
    const saldos=periods.map(p=>{
      const {entrada,saida}=this.splitEntradaSaida(this.getPeriodRows(p));
      return this.sumAbs(entrada)-this.sumAbs(saida);
    });
    return saldos.reduce((a,b)=>a+b,0)/saldos.length;
  },
  computeSaudeFinanceira(saldoAtual, receitaAtual, despesaAtual){
    const taxaPoupanca = receitaAtual>0 ? (saldoAtual/receitaAtual*100) : null;
    if(saldoAtual<0 || (receitaAtual>0 && despesaAtual>receitaAtual)){
      return {emoji:"🔴", label:"Crítico", cor:"var(--danger)", frase:"Suas despesas superaram as receitas neste período."};
    }
    if(taxaPoupanca!=null && taxaPoupanca<10){
      return {emoji:"🟡", label:"Atenção", cor:"var(--warning)", frase:`Você está guardando apenas ${taxaPoupanca.toFixed(0)}% da sua receita este mês.`};
    }
    return {emoji:"🟢", label:"Excelente", cor:"var(--success)", frase: taxaPoupanca!=null? `Você está guardando ${taxaPoupanca.toFixed(0)}% da sua receita este mês.` : "Seu saldo está positivo neste período."};
  },

  // Recomendações por regras simples (sem IA) — escolhe as mensagens mais relevantes entre as condições abaixo
  gerarRecomendacao(ctx){
    const {saldoAtual,despesaAtual,mediaEconomia,maiorGasto,metaPrincipal,periods}=ctx;
    const recs=[];
    if(maiorGasto && metaPrincipal && mediaEconomia!=null && mediaEconomia>0){
      const reducao=Math.max(20, Math.round(maiorGasto[1]*0.2/10)*10);
      const falta=Math.max(0, metaPrincipal.valorTotal-metaPrincipal.valorAtual);
      const mesesAtual=Math.ceil(falta/mediaEconomia);
      const mesesComReducao=Math.ceil(falta/(mediaEconomia+reducao));
      if(mesesAtual>0 && mesesComReducao<mesesAtual && isFinite(mesesAtual) && isFinite(mesesComReducao)){
        recs.push(`Se reduzir <b>${esc(maiorGasto[0])}</b> em ${fmtCurrency(reducao)} este mês, a meta "<b>${esc(metaPrincipal.nome)}</b>" pode sair ${mesesAtual-mesesComReducao} ${(mesesAtual-mesesComReducao)===1?"mês":"meses"} antes.`);
      }
    }
    if(mediaEconomia!=null){
      const mediaDespesas = periods.length? periods.map(p=>{const {saida}=this.splitEntradaSaida(this.getPeriodRows(p)); return this.sumAbs(saida);}).reduce((a,b)=>a+b,0)/periods.length : 0;
      if(despesaAtual>mediaDespesas*1.15){
        recs.push("Você está gastando acima da sua média habitual este mês.");
      }
    }
    if(periods.length>1){
      const saldos=periods.map(p=>{const {entrada,saida}=this.splitEntradaSaida(this.getPeriodRows(p)); return this.sumAbs(entrada)-this.sumAbs(saida);});
      if(saldoAtual===Math.max(...saldos) && saldoAtual>0){
        recs.push("Este foi o seu melhor mês até agora! 🎉");
      }
    }
    if(!recs.length) recs.push("Continue registrando seus lançamentos para receber recomendações mais precisas.");
    return recs.slice(0,2);
  },
  gerarConquistas(ctx){
    const {saldoAtual,saldoPassado,periods,metaPrincipal,mediaEconomia}=ctx;
    const conquistas=[];
    if(saldoPassado!=null && saldoAtual>saldoPassado && saldoAtual>0){
      conquistas.push(`🎉 Você economizou ${fmtCurrency(saldoAtual,true)} este mês.`);
    }
    if(periods.length>1){
      const saldos=periods.map(p=>{const {entrada,saida}=this.splitEntradaSaida(this.getPeriodRows(p)); return this.sumAbs(entrada)-this.sumAbs(saida);});
      if(saldoAtual===Math.max(...saldos) && saldoAtual>0){
        conquistas.push("👏 Você bateu seu recorde de economia.");
      }
    }
    if(metaPrincipal && mediaEconomia!=null && mediaEconomia>0){
      const falta=Math.max(0,metaPrincipal.valorTotal-metaPrincipal.valorAtual);
      const meses=Math.ceil(falta/mediaEconomia);
      if(isFinite(meses) && meses>0){
        conquistas.push(`🚀 Sua meta "${esc(metaPrincipal.nome)}" será concluída em ${meses} ${meses===1?"mês":"meses"} mantendo esse ritmo.`);
      }
    }
    if(!conquistas.length) conquistas.push("Continue lançando seus dados para desbloquear conquistas.");
    return conquistas;
  },

  /* ---------- v1.2 — Humanização: saudação, nome do usuário, mensagens dinâmicas ---------- */
  getSaudacao(){
    const h=new Date().getHours();
    const periodo = h<5 ? "Boa noite" : h<12 ? "Bom dia" : h<18 ? "Boa tarde" : "Boa noite";
    if(state.userName && state.userName.trim()) return `👋 ${periodo}, ${state.userName.trim()}`;
    return "Olá! 👋";
  },
  getSubtituloDia(){
    const hoje=new Date();
    const dias=["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
    const diaSemana=dias[hoje.getDay()];
    const ultimoDiaMes=new Date(hoje.getFullYear(),hoje.getMonth()+1,0).getDate();
    const faltam=ultimoDiaMes-hoje.getDate();
    const fraseDias = faltam<=0 ? "Hoje é o último dia do mês." : `Faltam ${faltam} ${faltam===1?"dia":"dias"} para terminar o mês.`;
    return `Hoje é ${diaSemana}. ${fraseDias}`;
  },
  // Regra simples (sem IA): escolhe uma frase motivacional entre as condições, por ordem de prioridade
  getFraseMotivacional(saldoAtual,saldoPassado,mediaEconomia,metaPrincipal){
    if(saldoPassado!=null && saldoAtual>saldoPassado) return "🎉 Você está economizando mais que no mês passado.";
    if(metaPrincipal && metaPrincipal.valorTotal>0 && (metaPrincipal.valorAtual/metaPrincipal.valorTotal)>=0.5) return "🚀 Sua meta está cada vez mais próxima.";
    if(mediaEconomia!=null && saldoAtual>mediaEconomia) return "💰 Você está no caminho certo.";
    if(saldoAtual>=0) return "👏 Continue assim.";
    return "💪 Vamos ajustar o ritmo este mês.";
  },
  renderVisaoGeral(){
    // Saudação e mensagem do dia (v1.2) — independem dos dados financeiros, então sempre são exibidas
    const saudEl=$("saudacaoTexto"), subEl=$("subtituloDia");
    if(saudEl) saudEl.textContent=this.getSaudacao();
    if(subEl) subEl.textContent=this.getSubtituloDia();

    const grid=$("visaoGeralGrid");
    if(!grid) return;
    if(!state.metricCol || !state.finalData.length){
      grid.innerHTML='<div class="text-muted text-sm md:col-span-2 xl:col-span-4">Sem dados suficientes para gerar a Visão Geral.</div>';
      const fEl=$("fraseMotivacional"), dEl=$("destaqueGastoHoje"), aEl=$("alertaFimMes");
      if(fEl) fEl.textContent="";
      if(dEl) dEl.innerHTML="";
      if(aEl) aEl.innerHTML="";
      return;
    }

    const periods=this.getAllPeriodsOrdered();
    const mesAtualKey = periods.length? periods[periods.length-1] : null;
    const mesPassadoKey = periods.length>1? periods[periods.length-2] : null;

    const rowsAtual = mesAtualKey!=null ? this.getPeriodRows(mesAtualKey) : state.finalData;
    const rowsPassado = mesPassadoKey!=null ? this.getPeriodRows(mesPassadoKey) : [];

    const {entrada:entAtual, saida:saiAtual}=this.splitEntradaSaida(rowsAtual);
    const {entrada:entPassado, saida:saiPassado}=this.splitEntradaSaida(rowsPassado);

    const receitaAtual=this.sumAbs(entAtual), despesaAtual=this.sumAbs(saiAtual);
    const receitaPassado=this.sumAbs(entPassado), despesaPassado=this.sumAbs(saiPassado);
    const saldoAtual=receitaAtual-despesaAtual;
    const saldoPassado = mesPassadoKey!=null ? (receitaPassado-despesaPassado) : null;

    const projecao=this.computeProjecaoFimMes(saldoAtual, mesAtualKey);
    const metasAtivas=state.goals.filter(g=>this.computeGoalStatus(g)!=="Concluída");
    const metaPrincipal=metasAtivas.slice().sort((a,b)=>new Date(a.dataLimite)-new Date(b.dataLimite))[0] || null;
    const mediaEconomia=this.computeMediaEconomiaMensal(periods);

    const groupedSaidaAtual=this.groupAbsBy(saiAtual, state.dimCol||"Categoria");
    const entriesSaidaAtual=Object.entries(groupedSaidaAtual).sort((a,b)=>b[1]-a[1]);
    const maiorGasto=entriesSaidaAtual[0]||null;
    const shareMaiorGasto = maiorGasto && despesaAtual>0 ? (maiorGasto[1]/despesaAtual*100) : 0;

    const disp=this.computeDisponibilidadeHoje(saldoAtual, metasAtivas);
    const saude=this.computeSaudeFinanceira(saldoAtual, receitaAtual, despesaAtual);
    const recomendacoes=this.gerarRecomendacao({saldoAtual,despesaAtual,mediaEconomia,maiorGasto,metaPrincipal,periods});
    const conquistas=this.gerarConquistas({saldoAtual,saldoPassado,periods,metaPrincipal,mediaEconomia});

    // ---- v1.2: frase motivacional (Alteração 5) ----
    const fEl=$("fraseMotivacional");
    if(fEl) fEl.textContent=this.getFraseMotivacional(saldoAtual,saldoPassado,mediaEconomia,metaPrincipal);

    // ---- v1.2: destaque grande "Você ainda pode gastar hoje" (Alteração 4) ----
    const dEl=$("destaqueGastoHoje");
    if(dEl) dEl.innerHTML=`
      <div class="text-sm font-semibold" style="color:rgba(255,255,255,.9);">💳 Você ainda pode gastar hoje</div>
      <div class="text-3xl md:text-4xl font-extrabold text-white mt-1">${fmtCurrency(disp.porDia,true)}</div>
      <div class="text-xs mt-1" style="color:rgba(255,255,255,.85);">Sem comprometer suas metas financeiras.</div>`;

    // ---- v1.2: alerta de previsão para o fim do mês (Alterações 6 e 7) ----
    const aEl=$("alertaFimMes");
    if(aEl){
      if(projecao<0){
        aEl.innerHTML=`<div class="flex items-start gap-2 text-sm p-3 rounded-xl" style="background:var(--danger-soft);color:var(--danger);border:1px solid var(--danger);">
          <span style="flex-shrink:0;">⚠️</span><span><b>Atenção.</b> Mantendo esse ritmo, seu saldo ficará negativo até o final do mês.</span>
        </div>`;
      } else {
        aEl.innerHTML=`<div class="flex items-start gap-2 text-sm p-3 rounded-xl" style="background:var(--success-soft);color:var(--success);border:1px solid var(--success);">
          <span style="flex-shrink:0;">🎉</span><span><b>Excelente.</b> Você deverá terminar o mês com saldo positivo.</span>
        </div>`;
      }
    }

    const cardShell=(titulo,icone,corIcone,conteudoHtml,destaque)=>`
      <div class="card p-4" ${destaque?'style="border-color:var(--danger);"':''}>
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs text-muted font-semibold">${titulo}</div>
          <div class="kpi-icon" style="width:30px;height:30px;background:${corIcone}22;font-size:.95rem;">${icone}</div>
        </div>
        ${conteudoHtml}
      </div>`;

    const cards=[];

    // Card 1 — Saldo previsto do mês
    cards.push(cardShell("Saldo previsto do mês","💰","var(--accent)",`
      <div class="text-xl font-extrabold" style="color:${saldoAtual>=0?'var(--success)':'var(--danger)'}">${fmtCurrency(saldoAtual,true)}</div>
      <div class="text-xs text-muted mt-1">Previsão até o fim do mês: <b style="color:${projecao>=0?'var(--text)':'var(--danger)'}">${fmtCurrency(projecao,true)}</b></div>
    `, projecao<0));

    // Card 2 — Quanto posso gastar hoje?
    cards.push(cardShell("Quanto posso gastar hoje?","🛒","var(--info)",`
      <div class="text-xl font-extrabold" style="color:var(--accent)">${fmtCurrency(disp.porDia,true)}<span class="text-xs text-muted font-semibold"> /dia</span></div>
      <div class="text-xs text-muted mt-1">${fmtCurrency(disp.disponivel,true)} disponíveis este mês sem comprometer metas</div>
    `));

    // Card 3 — Maior gasto
    cards.push(cardShell("Maior gasto","🔥","var(--danger)",
      maiorGasto? `
      <div class="text-xl font-extrabold truncate" style="color:var(--danger)">${esc(maiorGasto[0])}</div>
      <div class="text-xs text-muted mt-1">${shareMaiorGasto.toFixed(0)}% dos seus gastos${shareMaiorGasto>=30?" — quase um terço do total.":"."}</div>
      ` : `<div class="text-sm text-muted mt-1">Sem gastos registrados neste período.</div>`
    ));

    // Card 4 — Comparação com o mês passado
    let comparacaoHtml;
    if(saldoPassado==null){
      comparacaoHtml=`<div class="text-sm text-muted mt-1">Ainda não há um mês anterior para comparar.</div>`;
    } else {
      const diffDespesa=despesaPassado-despesaAtual; // positivo = gastou menos que antes
      const economizou=diffDespesa>=0;
      comparacaoHtml=`
        <div class="text-xl font-extrabold" style="color:${economizou?'var(--success)':'var(--danger)'}">${economizou?"Você economizou":"Você gastou mais"}</div>
        <div class="text-xs text-muted mt-1">${fmtCurrency(Math.abs(diffDespesa),true)} ${economizou?"a menos":"a mais"} em despesas que no mês passado</div>`;
    }
    cards.push(cardShell("Comparação com o mês passado","📊","var(--warning)",comparacaoHtml));

    // Card 5 — Meta Principal
    if(metaPrincipal){
      const falta=Math.max(0,metaPrincipal.valorTotal-metaPrincipal.valorAtual);
      const pct=metaPrincipal.valorTotal>0? Math.min(100,metaPrincipal.valorAtual/metaPrincipal.valorTotal*100):0;
      const previsaoMeses = mediaEconomia && mediaEconomia>0 ? Math.ceil(falta/mediaEconomia) : null;
      // v1.2 — frase humanizada (Alteração 8): prioriza a previsão em meses; sem ritmo de economia, usa o percentual concluído
      const fraseMeta = previsaoMeses
        ? `Faltam aproximadamente ${previsaoMeses} ${previsaoMeses===1?"mês":"meses"} para concluir sua meta.`
        : `Você já concluiu ${pct.toFixed(0)}% do seu objetivo.`;
      cards.push(cardShell("Meta principal","🎯","var(--accent)",`
        <div class="text-base font-extrabold truncate">${esc(metaPrincipal.nome)}</div>
        <div class="text-xs text-muted mt-1">${fmtCurrency(metaPrincipal.valorAtual,true)} de ${fmtCurrency(metaPrincipal.valorTotal,true)} · falta ${fmtCurrency(falta,true)}</div>
        <div class="h-2 rounded-full mt-2" style="background:var(--bg-soft);"><div class="h-2 rounded-full" style="width:${Math.max(3,pct)}%;background:linear-gradient(90deg,var(--accent),var(--accent-2));"></div></div>
        <div class="text-xs text-muted mt-1">${pct.toFixed(0)}% concluído${previsaoMeses? " · previsão: "+previsaoMeses+(previsaoMeses===1?" mês":" meses") : ""}</div>
        <div class="text-xs font-semibold mt-2" style="color:var(--accent);">${fraseMeta}</div>
      `));
    } else {
      cards.push(cardShell("Meta principal","🎯","var(--accent)",`<div class="text-sm text-muted mt-1">Nenhuma meta ativa. Cadastre uma em "Metas".</div>`));
    }

    // Card 6 — Recomendação do FinPilot
    cards.push(cardShell("Recomendação do FinPilot","🧭","var(--info)",`
      <div class="space-y-1.5">${recomendacoes.map(r=>`<div class="text-sm">${r}</div>`).join("")}</div>
    `));

    // Card 7 — Saúde Financeira
    cards.push(cardShell("Saúde financeira",saude.emoji,saude.cor,`
      <div class="text-xl font-extrabold" style="color:${saude.cor}">${saude.label}</div>
      <div class="text-xs text-muted mt-1">${saude.frase}</div>
    `));

    // Card 8 — Conquistas
    cards.push(cardShell("Conquistas","🏆","var(--warning)",`
      <div class="space-y-1.5">${conquistas.map(c=>`<div class="text-sm">${c}</div>`).join("")}</div>
    `));

    grid.innerHTML=cards.join("");
  },
  renderResumoMesPassado(){
    const statsEl=$("resumoMesPassadoStats");
    const emptyEl=$("chartResumoMesPassadoEmpty"), canvasEl=$("chartResumoMesPassado");
    if(!statsEl) return;

    const periods=this.getAllPeriodsOrdered();
    const mesPassadoKey = periods.length>1? periods[periods.length-2] : (periods.length===1? periods[0] : null);

    if(mesPassadoKey==null || !state.finalData.length){
      statsEl.innerHTML='<div class="text-muted text-sm col-span-full">Sem dados de meses anteriores ainda.</div>';
      this.destroyChart("chartResumoMesPassado");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      return;
    }

    const rows=this.getPeriodRows(mesPassadoKey);
    const {entrada,saida}=this.splitEntradaSaida(rows);
    const receita=this.sumAbs(entrada), despesa=this.sumAbs(saida), saldo=receita-despesa;
    const groupedSaida=this.groupAbsBy(saida, state.dimCol||"Categoria");
    const maiorCategoria=Object.entries(groupedSaida).sort((a,b)=>b[1]-a[1])[0];
    const qtd=rows.length;

    const stats=[
      {label:"Receita total", value:fmtCurrency(receita,true), color:"var(--success)"},
      {label:"Despesas totais", value:fmtCurrency(despesa,true), color:"var(--danger)"},
      {label:"Saldo", value:fmtCurrency(saldo,true), color: saldo>=0?"var(--success)":"var(--danger)"},
      {label:"Maior categoria", value: maiorCategoria? esc(maiorCategoria[0]):"—", color:"var(--accent)"},
      {label:"Lançamentos", value: qtd.toLocaleString("pt-BR"), color:"var(--info)"}
    ];
    statsEl.innerHTML=stats.map(s=>`
      <div>
        <div class="text-xs text-muted font-semibold">${s.label}</div>
        <div class="text-base font-extrabold mt-0.5 truncate" style="color:${s.color}">${s.value}</div>
      </div>`).join("");

    if(canvasEl) canvasEl.classList.remove("hidden");
    if(emptyEl) emptyEl.classList.add("hidden");
    this.destroyChart("chartResumoMesPassado");
    const ctx=document.getElementById("chartResumoMesPassado");
    if(!ctx) return;
    const textColor=this.chartTextColor(), gridColor=this.chartGridColor();
    state.charts.chartResumoMesPassado=new Chart(ctx,{
      type:"bar",
      data:{labels:["Receitas","Despesas"],datasets:[{data:[receita,despesa],backgroundColor:[this.cssVar('--success'),this.cssVar('--danger')],borderRadius:8,maxBarThickness:44}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtCurrency(c.parsed.y)}}},
        scales:{x:{ticks:{color:textColor,font:{size:10}},grid:{display:false}},y:{ticks:{color:textColor,callback:v=>fmtCurrency(v,true),font:{size:9}},grid:{color:gridColor}}}
      }
    });
  },

  /* ================= FIM VISÃO GERAL — FinPilot BI v1.1 ================= */

  /* ---------------- Master render ---------------- */
  renderAll(){
    try{
      $("errorBanner").classList.add("hidden");
      this.renderFiltersBar("filtersBar");
      this.renderFiltersBar("filtersBarTable");
      if(state.currentSection==="dashboard"){
        this.renderVisaoGeral();
        this.renderResumoMesPassado();
        this.renderKPIs();
        this.renderTimeChart();
        this.renderBarChart();
        this.renderDonutChart();
        this.renderMiniRanking();
        this.renderDiagnostico();
      } else if(state.currentSection==="table"){
        this.renderTable();
      } else if(state.currentSection==="analysis"){
        this.renderAnalysis();
      } else if(state.currentSection==="entries"){
        this.renderEntriesSection();
      } else if(state.currentSection==="goals"){
        this.renderGoals();
      }
    }catch(err){
      console.error("Erro ao renderizar:", err);
      const banner=$("errorBanner");
      if(banner){
        banner.classList.remove("hidden");
        banner.textContent="Ocorreu um erro ao gerar os gráficos: "+err.message+" (veja o console do navegador — F12 — para detalhes, e me envie essa mensagem).";
      }
    }
  }
});
