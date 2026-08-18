"use strict";

/* ================= /admin — módulo 100% independente ================= */
// Não depende de App.goSection(), Account.showPanel(), renderAll(),
// clearFinancialState() nem de nenhum arquivo do app financeiro.
// Tem seu próprio cliente Supabase, seu próprio helper $ e sua
// própria lógica de autenticação/autorização.

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(d){ if(!d) return "—"; try{ return new Date(d).toLocaleDateString("pt-BR"); }catch(e){ return "—"; } }
function fmtMoney(cents, currency){ return ((cents||0)/100).toLocaleString("pt-BR", { style:"currency", currency: currency||"BRL" }); }

const STATUS_LABELS = {
  trialing: "Em teste gratuito",
  active: "Assinatura ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Teste expirado",
  blocked: "Bloqueada"
};

// ===== Configuração do Supabase (mesmo projeto do app principal) =====
const SUPABASE_URL = "https://qkktrdgwhjzhfzdjpmks.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UN0woH-nXlj8eGuSH0Qv7A_r_lGLPc8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType:"implicit", autoRefreshToken:true, persistSession:true, detectSessionInUrl:false }
});
// ===== Fim da configuração do Supabase =====

function showScreen(name){
  ["adminChecking","adminNoSession","adminDenied","adminApp"].forEach(id=>{
    const el=$(id);
    if(el) el.classList.toggle("hidden", id!==name);
  });
}

const AdminAuth = {
  async init(){
    showScreen("adminChecking");
    const diag = { sessao:"não encontrada", usuario:"—", userId:"—", perfil:"não encontrado", role:"—", erro:"—" };
    try{
      // 1) Sessão
      const { data:{ session } } = await supabaseClient.auth.getSession();
      if(!session){
        showScreen("adminNoSession");
        console.log("[AdminAuth] Sem sessão — usuário precisa fazer login em /");
        return;
      }
      diag.sessao = "encontrada";

      // 2) Confirma o usuário autenticado NO SERVIDOR (não confia só no
      // token local) — é mais confiável que ler session.user direto.
      const { data:{ user }, error: userError } = await supabaseClient.auth.getUser();
      if(userError || !user){
        diag.erro = userError ? userError.message : "getUser() não retornou usuário";
        console.error("[AdminAuth] Falha ao confirmar usuário no servidor:", userError);
        this._renderDiag(diag);
        showScreen("adminDenied");
        return;
      }
      diag.usuario = user.email || "—";
      diag.userId = user.id;

      // 3) Consulta o perfil para checar o role
      const { data: profile, error } = await supabaseClient
        .from("profiles").select("role").eq("id", user.id).maybeSingle();

      if(error){
        diag.erro = error.message || "erro desconhecido";
        console.error("[AdminAuth] Erro ao consultar profiles:", {
          code: error.code, message: error.message, details: error.details, hint: error.hint
        });
        this._renderDiag(diag);
        showScreen("adminDenied");
        return;
      }

      if(!profile){
        diag.perfil = "não encontrado";
        diag.erro = "Perfil administrativo não encontrado para este usuário.";
        console.error("[AdminAuth] Perfil não encontrado para user_id:", user.id);
        this._renderDiag(diag);
        showScreen("adminDenied");
        return;
      }

      diag.perfil = "encontrado";
      diag.role = profile.role || "—";

      if(profile.role !== "admin"){
        console.log("[AdminAuth] Usuário autenticado, mas role não é admin:", profile.role);
        this._renderDiag(diag);
        showScreen("adminDenied");
        return;
      }

      // 4) Liberado
      showScreen("adminApp");
      AdminPanel.showTab("overview");
    }catch(e){
      diag.erro = e && e.message ? e.message : String(e);
      console.error("[AdminAuth] Falha inesperada ao verificar acesso administrativo:", e);
      this._renderDiag(diag);
      showScreen("adminDenied");
    }
  },

  // Diagnóstico temporário, só na tela de "acesso restrito" — nunca
  // mostra senha, token, access_token ou refresh_token.
  _renderDiag(diag){
    const box=$("adminDiagBox");
    if(!box) return;
    box.innerHTML =
      "<div><strong>Sessão:</strong> "+esc(diag.sessao)+"</div>"+
      "<div><strong>Usuário:</strong> "+esc(diag.usuario)+"</div>"+
      "<div><strong>User ID:</strong> "+esc(diag.userId)+"</div>"+
      "<div><strong>Perfil:</strong> "+esc(diag.perfil)+"</div>"+
      "<div><strong>Role:</strong> "+esc(diag.role)+"</div>"+
      "<div><strong>Erro Supabase:</strong> "+esc(diag.erro)+"</div>";
    box.classList.remove("hidden");
  },

  async logout(){
    await supabaseClient.auth.signOut();
    window.location.href = "/";
  }
};

const AdminPanel = {
  _plansCache: [],

  showTab(tab){
    ["overview","users","plans","subs","metrics"].forEach(t=>{
      const el=$("admintab-"+t);
      if(el) el.classList.toggle("hidden", t!==tab);
    });
    document.querySelectorAll(".chip[data-admintab]").forEach(el=>{
      el.classList.toggle("active", el.dataset.admintab===tab);
    });
    if(tab==="overview" || tab==="metrics"){ this.loadOverview(); }
    if(tab==="users"){ this.loadUsers(); }
    if(tab==="plans"){ this.loadPlans(); }
    if(tab==="subs"){ this.loadSubscriptions(); }
  },

  // A proteção real é o banco (RLS + is_admin() + RPCs security
  // definer). Se por algum motivo um usuário não-admin chegasse até
  // aqui, as consultas só devolveriam a própria linha, e as ações
  // administrativas (RPC) recusariam com erro.
  async _fetchAdminData(){
    const [{ data: profiles, error: pErr }, { data: subs, error: sErr }, { data: plans, error: plErr }] = await Promise.all([
      supabaseClient.from("profiles").select("id,user_name,email,created_at,role"),
      supabaseClient.from("subscriptions").select("*, plans(name)"),
      supabaseClient.from("plans").select("*").order("created_at",{ascending:true})
    ]);
    if(pErr) console.error("admin profiles:", pErr.message);
    if(sErr) console.error("admin subscriptions:", sErr.message);
    if(plErr) console.error("admin plans:", plErr.message);
    this._plansCache = plans||[];
    return { profiles: profiles||[], subs: subs||[], plans: plans||[] };
  },

  async loadOverview(){
    const grid1=$("adminOverviewGrid"), grid2=$("adminMetricsGrid"), distTable=$("adminPlanDistTable");
    const { profiles, subs, plans } = await this._fetchAdminData();

    let trial=0, active=0, expired=0, canceled=0, blocked=0;
    const byPlan={};
    subs.forEach(s=>{
      if(s.status==="trialing") trial++;
      else if(s.status==="active") active++;
      else if(s.status==="canceled") canceled++;
      else if(s.status==="expired") expired++;
      else if(s.status==="blocked") blocked++;
      const pname = s.plans ? s.plans.name : "(sem plano)";
      byPlan[pname]=(byPlan[pname]||0)+1;
    });

    const metric=(label,val)=>`<div class="card p-3"><div class="text-xs text-muted font-semibold">${esc(label)}</div><div class="text-xl font-extrabold mt-1">${val}</div></div>`;
    const cardsHtml =
      metric("Total de usuários", profiles.length) +
      metric("Usuários ativos", active) +
      metric("Usuários bloqueados", blocked) +
      metric("Assinaturas ativas", active) +
      metric("Assinaturas em trial", trial) +
      metric("Assinaturas vencidas", expired+canceled) +
      metric("Planos cadastrados", plans.length) +
      metric("Receita mensal", "R$ 0,00"); // sem gateway de cobrança ainda — não inventar dado

    if(grid1) grid1.innerHTML = cardsHtml;
    if(grid2) grid2.innerHTML = cardsHtml;

    if(distTable){
      const rows = Object.keys(byPlan).map(name=>`<tr class="border-t border-base"><td class="py-2">${esc(name)}</td><td class="py-2">${byPlan[name]}</td></tr>`).join("");
      distTable.querySelector("tbody").innerHTML = rows || '<tr><td class="text-muted text-sm p-3" colspan="2">Sem dados ainda.</td></tr>';
    }
  },

  async loadUsers(){
    const usersTable=$("adminUsersTable");
    if(!usersTable) return;
    const { profiles, subs } = await this._fetchAdminData();
    const subByUser={};
    subs.forEach(s=>{ subByUser[s.user_id]=s; });

    usersTable.querySelector("tbody").innerHTML = profiles.map(p=>{
      const sub=subByUser[p.id];
      const statusLabel = sub ? (STATUS_LABELS[sub.status]||sub.status) : "sem assinatura";
      const planName = sub && sub.plans ? sub.plans.name : "—";
      const criado = fmtDate(p.created_at);
      const trialAte = sub && sub.status==="trialing" ? fmtDate(sub.trial_end) : "—";
      const isBlocked = sub && sub.status==="blocked";
      return `<tr class="border-t border-base">
        <td class="py-2 pr-3">${esc(p.user_name||"(sem nome)")}</td>
        <td class="py-2 pr-3 text-muted">${esc(p.email||"—")}</td>
        <td class="py-2 pr-3 text-muted">${esc(criado)}</td>
        <td class="py-2 pr-3">${esc(planName)}</td>
        <td class="py-2 pr-3">${esc(statusLabel)}</td>
        <td class="py-2 pr-3">${esc(p.role)}</td>
        <td class="py-2 pr-3 text-muted">${esc(trialAte)}</td>
        <td class="py-2 pr-3 flex flex-wrap gap-1">
          <button class="btn btn-sm" onclick="AdminPanel.promptSetRole('${p.id}','${p.role}')">Role</button>
          <button class="btn btn-sm" onclick="AdminPanel.promptSetPlan('${p.id}')">Plano</button>
          <button class="btn btn-sm" onclick="AdminPanel.promptSetStatus('${p.id}')">Status</button>
          <button class="btn btn-sm ${isBlocked?'':'btn-danger'}" onclick="AdminPanel.${isBlocked?'unblockUser':'blockUser'}('${p.id}')">${isBlocked?'Desbloquear':'Bloquear'}</button>
        </td>
      </tr>`;
    }).join("") || '<tr><td class="text-muted text-sm p-3" colspan="8">Nenhum usuário encontrado.</td></tr>';
  },

  async promptSetRole(userId, currentRole){
    const novo = prompt('Novo role para este usuário ("user" ou "admin"):', currentRole);
    if(novo===null) return;
    if(novo!=="user" && novo!=="admin"){ alert('Role inválido. Use exatamente "user" ou "admin".'); return; }
    if(novo==="admin" && !confirm("Confirma tornar este usuário ADMINISTRADOR?")) return;
    const { error } = await supabaseClient.rpc("admin_set_role", { target_user_id:userId, new_role:novo });
    if(error){ alert("Não foi possível alterar o role.\n\n"+error.message); return; }
    alert("Role atualizado com sucesso.");
    this.loadUsers();
  },

  async promptSetPlan(userId){
    if(!this._plansCache.length){ alert("Nenhum plano cadastrado ainda."); return; }
    const opcoes = this._plansCache.map((p,i)=>(i+1)+") "+p.name).join("\n");
    const escolha = prompt("Escolha o novo plano deste usuário:\n"+opcoes);
    if(escolha===null) return;
    const idx = parseInt(escolha,10)-1;
    const plano = this._plansCache[idx];
    if(!plano){ alert("Opção inválida."); return; }
    const { error } = await supabaseClient.rpc("admin_update_subscription", { target_user_id:userId, new_plan_id:plano.id });
    if(error){ alert("Não foi possível alterar o plano.\n\n"+error.message); return; }
    alert("Plano atualizado com sucesso.");
    this.loadUsers();
  },

  async promptSetStatus(userId){
    const validos=["trialing","active","past_due","canceled","expired","blocked"];
    const novo = prompt("Novo status da assinatura:\n"+validos.join(", "));
    if(novo===null) return;
    if(!validos.includes(novo)){ alert("Status inválido."); return; }
    const { error } = await supabaseClient.rpc("admin_update_subscription", { target_user_id:userId, new_status:novo });
    if(error){ alert("Não foi possível alterar o status.\n\n"+error.message); return; }
    alert("Status atualizado com sucesso.");
    this.loadUsers();
  },

  // Exclusão real de auth.users exige a Admin API do Supabase
  // (Service Role Key), que nunca pode ir para o frontend. Por isso a
  // ação disponível é bloquear (impede acesso via has_active_access()),
  // não apagar a conta. Exclusão definitiva fica para a Fase 4
  // (backend/edge function com Service Role Key, fora do navegador).
  async blockUser(userId){
    if(!confirm("Bloquear este usuário? Ele perderá acesso ao dashboard imediatamente. A conta e os dados NÃO são apagados.")) return;
    const { error } = await supabaseClient.rpc("admin_update_subscription", { target_user_id:userId, new_status:"blocked" });
    if(error){ alert("Não foi possível bloquear o usuário.\n\n"+error.message); return; }
    this.loadUsers();
  },
  async unblockUser(userId){
    const { error } = await supabaseClient.rpc("admin_update_subscription", { target_user_id:userId, new_status:"active" });
    if(error){ alert("Não foi possível desbloquear o usuário.\n\n"+error.message); return; }
    this.loadUsers();
  },

  // ---------------- Planos ----------------
  async loadPlans(){
    const plansTable=$("adminPlansTable");
    if(!plansTable) return;
    const { plans } = await this._fetchAdminData();
    plansTable.querySelector("tbody").innerHTML = plans.map(pl=>{
      const preco = fmtMoney(pl.price_cents, pl.currency);
      return `<tr class="border-t border-base">
        <td class="py-2 pr-3">${esc(pl.name)}</td>
        <td class="py-2 pr-3">${preco}</td>
        <td class="py-2 pr-3 text-muted">${pl.billing_period==="yearly"?"Anual":"Mensal"}</td>
        <td class="py-2 pr-3">${pl.is_active?"Ativo":"Inativo"}</td>
        <td class="py-2 pr-3 flex flex-wrap gap-1">
          <button class="btn btn-sm" onclick="AdminPanel.editPlan('${pl.id}')">Editar</button>
          <button class="btn btn-sm" onclick="AdminPanel.togglePlanActive('${pl.id}',${pl.is_active})">${pl.is_active?"Desativar":"Ativar"}</button>
          <button class="btn btn-sm btn-danger" onclick="AdminPanel.deletePlan('${pl.id}','${esc(pl.name)}')">Excluir</button>
        </td>
      </tr>`;
    }).join("") || '<tr><td class="text-muted text-sm p-3" colspan="5">Nenhum plano cadastrado.</td></tr>';
  },

  async createPlan(evt){
    evt.preventDefault();
    const name=$("newPlanName").value.trim();
    const priceReais=parseFloat($("newPlanPrice").value);
    const period=$("newPlanPeriod").value;
    const active=$("newPlanActive").value==="true";
    if(!name || isNaN(priceReais) || priceReais<0){ alert("Preencha nome e preço corretamente."); return; }
    const { error } = await supabaseClient.from("plans").insert({
      name, price_cents: Math.round(priceReais*100), currency:"BRL", billing_period:period, is_active:active
    });
    if(error){ alert("Não foi possível criar o plano.\n\n"+error.message); return; }
    $("newPlanName").value=""; $("newPlanPrice").value="";
    this.loadPlans();
  },

  async editPlan(planId){
    const plano = this._plansCache.find(p=>p.id===planId);
    if(!plano) return;
    const novoNome = prompt("Nome do plano:", plano.name);
    if(novoNome===null) return;
    const novoPrecoStr = prompt("Preço em R$:", (plano.price_cents/100).toFixed(2));
    if(novoPrecoStr===null) return;
    const novoPreco = parseFloat(novoPrecoStr.replace(",","."));
    if(!novoNome.trim() || isNaN(novoPreco) || novoPreco<0){ alert("Dados inválidos. Nada foi alterado."); return; }
    const novaPeriodicidade = prompt('Periodicidade ("monthly" ou "yearly"):', plano.billing_period) || plano.billing_period;
    const { error } = await supabaseClient.from("plans").update({
      name: novoNome.trim(), price_cents: Math.round(novoPreco*100), billing_period: novaPeriodicidade
    }).eq("id", planId);
    if(error){ alert("Não foi possível editar o plano.\n\n"+error.message); return; }
    this.loadPlans();
  },

  async togglePlanActive(planId, isActiveNow){
    const { error } = await supabaseClient.from("plans").update({ is_active: !isActiveNow }).eq("id", planId);
    if(error){ alert("Não foi possível alterar o status do plano.\n\n"+error.message); return; }
    this.loadPlans();
  },

  async deletePlan(planId, planName){
    if(!confirm('Excluir o plano "'+planName+'"? Essa ação não pode ser desfeita.')) return;
    const { error } = await supabaseClient.from("plans").delete().eq("id", planId);
    if(error){
      if(/foreign key|violates/i.test(error.message)){
        alert('Este plano não pode ser excluído porque existem assinaturas vinculadas a ele. Desative o plano em vez de excluir.');
      } else {
        alert("Não foi possível excluir o plano.\n\n"+error.message);
      }
      return;
    }
    this.loadPlans();
  },

  // ---------------- Assinaturas ----------------
  async loadSubscriptions(){
    const subsTable=$("adminSubsTable");
    if(!subsTable) return;
    const { profiles, subs } = await this._fetchAdminData();
    const nameByUser={};
    profiles.forEach(p=>{ nameByUser[p.id]=p.user_name||p.email||p.id; });

    subsTable.querySelector("tbody").innerHTML = subs.map(s=>{
      const planName = s.plans ? s.plans.name : "—";
      return `<tr class="border-t border-base">
        <td class="py-2 pr-3">${esc(nameByUser[s.user_id]||s.user_id)}</td>
        <td class="py-2 pr-3">${esc(planName)}</td>
        <td class="py-2 pr-3">${esc(STATUS_LABELS[s.status]||s.status)}</td>
        <td class="py-2 pr-3 text-muted">${fmtDate(s.current_period_start)}</td>
        <td class="py-2 pr-3 text-muted">${fmtDate(s.current_period_end)}</td>
        <td class="py-2 pr-3 text-muted">${s.status==="trialing"?fmtDate(s.trial_end):"—"}</td>
        <td class="py-2 pr-3 text-muted">${esc(s.provider||"—")}</td>
        <td class="py-2 pr-3 text-muted">${esc(s.external_subscription_id||"—")}</td>
        <td class="py-2 pr-3 flex flex-wrap gap-1">
          <button class="btn btn-sm" onclick="AdminPanel.promptSetPlan('${s.user_id}')">Plano</button>
          <button class="btn btn-sm" onclick="AdminPanel.promptSetStatus('${s.user_id}')">Status</button>
          <button class="btn btn-sm btn-danger" onclick="AdminPanel.cancelSubscription('${s.user_id}')">Cancelar</button>
          <button class="btn btn-sm" onclick="AdminPanel.reactivateSubscription('${s.user_id}')">Reativar</button>
        </td>
      </tr>`;
    }).join("") || '<tr><td class="text-muted text-sm p-3" colspan="9">Nenhuma assinatura encontrada.</td></tr>';
  },

  async cancelSubscription(userId){
    if(!confirm("Cancelar a assinatura deste usuário?")) return;
    const { error } = await supabaseClient.rpc("admin_update_subscription", { target_user_id:userId, new_status:"canceled" });
    if(error){ alert("Não foi possível cancelar.\n\n"+error.message); return; }
    this.loadSubscriptions();
  },
  async reactivateSubscription(userId){
    const { error } = await supabaseClient.rpc("admin_update_subscription", { target_user_id:userId, new_status:"active" });
    if(error){ alert("Não foi possível reativar.\n\n"+error.message); return; }
    this.loadSubscriptions();
  }
};

window.AdminAuth = AdminAuth;
window.AdminPanel = AdminPanel;

AdminAuth.init();
