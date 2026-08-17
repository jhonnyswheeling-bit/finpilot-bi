"use strict";

/* ================= Minha Conta (usuário comum) ================= */
// Aditivo: não redefine nada de auth.js/app.js/dashboard.js/charts.js.
// Usa supabaseClient e $ já globais. NÃO contém nenhuma lógica
// administrativa — isso agora vive inteiramente em /admin (admin.js),
// um módulo separado que não depende deste arquivo nem de App.

const STATUS_LABELS = {
  trialing: "Em teste gratuito",
  active: "Assinatura ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Teste expirado",
  blocked: "Bloqueada"
};

function fmtDate(d){
  if(!d) return "—";
  try{ return new Date(d).toLocaleDateString("pt-BR"); }catch(e){ return "—"; }
}

const Account = {
  profile: null,
  subscription: null,
  plan: null,
  email: "",

  async init(){
    try{
      const { data:{ session } } = await supabaseClient.auth.getSession();
      if(!session) return true;
      this.email = session.user.email || "";

      const [profileRes, subRes] = await Promise.all([
        supabaseClient.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
        supabaseClient.from("subscriptions").select("*, plans(*)").eq("user_id", session.user.id)
          .order("created_at", { ascending:false }).limit(1).maybeSingle()
      ]);

      if(profileRes.error){ console.error("Erro ao carregar perfil:", profileRes.error.message); }
      if(subRes.error){ console.error("Erro ao carregar assinatura:", subRes.error.message); }

      this.profile = profileRes.data || null;
      this.subscription = subRes.data || null;
      this.plan = (subRes.data && subRes.data.plans) ? subRes.data.plans : null;

      this.refreshPanel();

      return this.hasAccess();
    }catch(e){
      console.error("Account.init() falhou, liberando acesso por segurança:", e);
      return true;
    }
  },

  hasAccess(){
    if(!this.subscription) return true;
    const s = this.subscription.status;
    if(s==="active") return true;
    if(s==="trialing"){
      if(!this.subscription.trial_end) return true;
      return new Date(this.subscription.trial_end).getTime() > Date.now();
    }
    return false;
  },

  // Chamado por App.goSection("account") toda vez que a seção é aberta.
  refreshPanel(){
    const nameEl=$("accountName"), emailEl=$("accountEmail"), planEl=$("accountPlan"),
          statusEl=$("accountStatus"), periodEl=$("accountPeriod");
    if(nameEl) nameEl.textContent = (typeof state!=="undefined" && state.userName) ? state.userName : "—";
    if(emailEl) emailEl.textContent = this.email || "—";
    if(planEl) planEl.textContent = this.plan ? this.plan.name : "—";
    if(statusEl){
      let label = this.subscription ? (STATUS_LABELS[this.subscription.status] || this.subscription.status) : "—";
      if(this.subscription && this.subscription.status==="trialing" && this.subscription.trial_end){
        const dias = Math.max(0, Math.ceil((new Date(this.subscription.trial_end).getTime()-Date.now())/86400000));
        label += " · " + dias + " dia(s) restante(s)";
      }
      statusEl.textContent = label;
    }
    if(periodEl){
      if(this.subscription && this.subscription.status==="trialing"){
        periodEl.textContent = "Trial até " + fmtDate(this.subscription.trial_end);
      } else if(this.subscription && (this.subscription.current_period_start || this.subscription.current_period_end)){
        periodEl.textContent = fmtDate(this.subscription.current_period_start) + " até " + fmtDate(this.subscription.current_period_end);
      } else {
        periodEl.textContent = "—";
      }
    }
  },

  async changePassword(){
    const novaSenha=prompt("Digite sua nova senha (mínimo 6 caracteres):");
    if(novaSenha===null) return;
    if(novaSenha.length<6){ alert("A senha deve ter pelo menos 6 caracteres."); return; }
    const confirmSenha=prompt("Confirme a nova senha:");
    if(confirmSenha===null) return;
    if(novaSenha!==confirmSenha){ alert("As senhas não coincidem. Nada foi alterado."); return; }
    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
    if(error){ alert("Não foi possível alterar sua senha. Tente novamente.\n\n"+error.message); return; }
    alert("Senha alterada com sucesso!");
  }
};

window.Account = Account;
