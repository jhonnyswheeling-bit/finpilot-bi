"use strict";

/* ---------------- App: construção dos gráficos (Chart.js) ---------------- */
Object.assign(App, {
  renderTimeChart(){
    const rows=this.getFilteredData();
    const emptyEl=$("chartTimeEmpty"), canvasEl=$("chartTime"), toggleEl=$("chartTimeToggle");
    if(!state.periodCol){
      this.destroyChart("chartTime");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      if(toggleEl) toggleEl.innerHTML="";
      $("chartTimeTitle").textContent="Evolução por período";
      return;
    }
    if(canvasEl) canvasEl.classList.remove("hidden");
    if(emptyEl) emptyEl.classList.add("hidden");
    const grouped=this.groupSum(rows,state.periodCol,state.metricCol);
    const labels=this.orderPeriods(Object.keys(grouped));
    const data=labels.map(l=>grouped[l]);
    this.destroyChart("chartTime");
    const ctx=document.getElementById("chartTime");
    if(!ctx) return;
    const textColor=this.chartTextColor(), grid=this.chartGridColor();
    state.charts.chartTime=new Chart(ctx,{
      type: state.timeChartType,
      data:{labels, datasets:[{
        label:state.metricCol, data,
        borderColor:"#6366f1", backgroundColor: state.timeChartType==="line" ? "rgba(99,102,241,.15)" : "#6366f1",
        borderWidth:2, tension:.35, fill:true, pointRadius:3, pointBackgroundColor:"#6366f1", borderRadius:6, maxBarThickness:46
      }]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:(c)=>fmtCurrency(c.parsed.y)}}},
        scales:{ x:{ticks:{color:textColor},grid:{display:false}}, y:{ticks:{color:textColor,callback:v=>fmtCurrency(v,true)},grid:{color:grid}} }
      }
    });
    $("chartTimeToggle").innerHTML = `
      <button class="btn btn-sm ${state.timeChartType==='line'?'btn-primary':''}" onclick="App.setTimeChartType('line')">Linha</button>
      <button class="btn btn-sm ${state.timeChartType==='bar'?'btn-primary':''}" onclick="App.setTimeChartType('bar')">Barra</button>`;
    $("chartTimeTitle").textContent = "Evolução de "+state.metricCol+" por "+state.periodCol;
  },
  setTimeChartType(t){ state.timeChartType=t; this.renderTimeChart(); },
  renderBarChart(){
    const rows=this.getFilteredData();
    const emptyEl=$("chartBarEmpty"), canvasEl=$("chartBar");
    if(!state.dimCol){
      this.destroyChart("chartBar");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if(canvasEl) canvasEl.classList.remove("hidden");
    if(emptyEl) emptyEl.classList.add("hidden");
    const grouped=this.groupSum(rows,state.dimCol,state.metricCol);
    const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const total=Object.values(grouped).reduce((a,b)=>a+b,0)||1;
    this.destroyChart("chartBar");
    const ctx=document.getElementById("chartBar");
    if(!ctx) return;
    const textColor=this.chartTextColor(), grid=this.chartGridColor();
    state.charts.chartBar=new Chart(ctx,{
      type:"bar",
      data:{labels:entries.map(e=>e[0]), datasets:[{label:state.metricCol,data:entries.map(e=>e[1]),backgroundColor:entries.map((_,i)=>CHART_PALETTE[i%CHART_PALETTE.length]),borderRadius:8,maxBarThickness:34}]},
      options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtCurrency(c.parsed.x)+"  ("+(c.parsed.x/total*100).toFixed(1)+"%)"}}},
        scales:{ x:{ticks:{color:textColor,callback:v=>fmtCurrency(v,true)},grid:{color:grid}}, y:{ticks:{color:textColor},grid:{display:false}} }
      }
    });
    $("chartBarTitle").textContent="Total de "+state.metricCol+" por "+state.dimCol;
  },
  renderDonutChart(){
    const rows=this.getFilteredData();
    const emptyEl=$("chartDonutEmpty"), canvasEl=$("chartDonut");
    if(!state.dimCol){
      this.destroyChart("chartDonut");
      if(canvasEl) canvasEl.classList.add("hidden");
      if(emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if(canvasEl) canvasEl.classList.remove("hidden");
    if(emptyEl) emptyEl.classList.add("hidden");
    const grouped=this.groupSum(rows,state.dimCol,state.metricCol);
    let entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
    if(entries.length>6){
      const top=entries.slice(0,6); const rest=entries.slice(6).reduce((a,e)=>a+e[1],0);
      entries=top; if(rest) entries.push(["Outros",rest]);
    }
    const total=entries.reduce((a,e)=>a+e[1],0)||1;
    this.destroyChart("chartDonut");
    const ctx=document.getElementById("chartDonut");
    if(!ctx) return;
    const textColor=this.chartTextColor();
    state.charts.chartDonut=new Chart(ctx,{
      type:"doughnut",
      data:{labels:entries.map(e=>e[0]+" ("+(e[1]/total*100).toFixed(0)+"%)"),datasets:[{data:entries.map(e=>e[1]),backgroundColor:CHART_PALETTE,borderWidth:2,borderColor:state.dark?'#111a2e':'#fff'}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:"62%",
        plugins:{legend:{position:"bottom",labels:{color:textColor,boxWidth:10,font:{size:10}}},tooltip:{callbacks:{label:c=>c.label.replace(/\s*\([^)]*\)$/,"")+": "+fmtCurrency(c.parsed)+"  ("+(c.parsed/total*100).toFixed(1)+"%)"}}}
      }
    });
    $("chartDonutTitle").textContent="Distribuição por "+state.dimCol;
  },
});
