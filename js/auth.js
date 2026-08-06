"use strict";

/* ================= AUTENTICAÇÃO (Supabase) — Fase 1 ================= */

// ===== Configuração do Supabase =====
// Painel Supabase → seu projeto → Settings → API
//   Project URL      → cole entre as aspas de SUPABASE_URL
//   anon public key  → cole entre as aspas de SUPABASE_ANON_KEY
// Não use a "service_role key" aqui — ela nunca deve ficar no front-end.
const SUPABASE_URL = "https://qkktrdgwhjzhfzdjpmks.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UN0woH-nXlj8eGuSH0Qv7A_r_lGLPc8";
const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
// ===== Fim da configuração do Supabase =====

const Auth = {
  appStarted: false, // garante que App.init() só rode uma vez por sessão de página

  init(){
    // Detecta se o usuário chegou aqui clicando no link de confirmação de
    // e-mail (Supabase adiciona type=signup na URL de retorno).
    this.pendingConfirmation = /type=signup/.test(window.location.hash) || /type=signup/.test(window.location.search);

    supabaseClient.auth.onAuthStateChange((event, session)=>{
      if(event==="PASSWORD_RECOVERY"){
        this.hideChecking();
        this.showForm("newPasswordForm");
        return;
      }
      if(session){
        if(this.pendingConfirmation){
          this.pendingConfirmation=false;
          this.hideChecking();
          this.showForm("emailConfirmedView");
          return;
        }
        this.onAuthenticated(session);
      }
      else if(event==="SIGNED_OUT" || event==="INITIAL_SESSION"){ this.onSignedOut(); }
    });

    supabaseClient.auth.getSession().then(({data})=>{
      if(data.session && !this.pendingConfirmation){ this.onAuthenticated(data.session); }
      else if(!data.session){ this.onSignedOut(); }
      // se houver sessão E pendingConfirmation, o onAuthStateChange acima já cuidou da tela.
    });
  },

  // Chamado pelo botão "Entrar no FinPilot BI" da tela de conta ativada.
  continueAfterConfirmation(){
    this.hideChecking();
    supabaseClient.auth.getSession().then(({data})=>{
      if(data.session){ this.onAuthenticated(data.session); }
    });
  },

  onAuthenticated(session){
    this.hideChecking();
    $("authView").classList.add("hidden");
    $("uploadView").classList.remove("hidden");
    const emailEl=$("sidebarUserEmail");
    if(emailEl){ emailEl.textContent=session.user.email||""; emailEl.title=session.user.email||""; }
    if(!this.appStarted){
      this.appStarted=true;
      App.init();
    }
  },

  onSignedOut(){
    this.hideChecking();
    $("uploadView").classList.add("hidden");
    $("configView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("authView").classList.remove("hidden");
    this.showForm("loginForm");
  },

  hideChecking(){ $("authChecking").classList.add("hidden"); },

  showForm(id){
    ["loginForm","signupForm","recoverForm","newPasswordForm","signupSuccessBox","emailConfirmedView"].forEach(f=>$(f).classList.add("hidden"));
    $(id).classList.remove("hidden");
    const resendBox=$("resendConfirmBox");
    if(resendBox) resendBox.classList.add("hidden");
    this.clearMsg();
  },
  showLogin(){ this.showForm("loginForm"); },
  showSignup(){ this.showForm("signupForm"); },
  showRecover(){ this.showForm("recoverForm"); },

  showMsg(text, type){
    const el=$("authMsg");
    el.textContent=text;
    el.classList.remove("hidden");
    el.style.background = type==="error" ? "var(--danger-soft)" : "var(--success-soft)";
    el.style.color = type==="error" ? "var(--danger)" : "var(--success)";
    el.style.border = "1px solid " + (type==="error" ? "var(--danger)" : "var(--success)");
  },
  clearMsg(){ const el=$("authMsg"); if(el) el.classList.add("hidden"); },

  async doLogin(e){
    e.preventDefault();
    this.clearMsg();
    const email=$("loginEmail").value.trim();
    const password=$("loginPassword").value;
    const resendBox=$("resendConfirmBox");
    if(resendBox) resendBox.classList.add("hidden");
    const {error}=await supabaseClient.auth.signInWithPassword({email, password});
    if(error){
      this.showMsg(this.translateError(error), "error");
      if(error.message && error.message.includes("Email not confirmed")){
        this.lastLoginEmail=email;
        if(resendBox) resendBox.classList.remove("hidden");
      }
    }
    return false;
  },

  async doResendConfirmation(){
    if(!this.lastLoginEmail) return;
    const {error}=await supabaseClient.auth.resend({ type:"signup", email:this.lastLoginEmail });
    if(error){ this.showMsg(this.translateError(error), "error"); return; }
    this.showMsg("E-mail de confirmação reenviado! Verifique também Spam e Promoções.", "success");
    const resendBox=$("resendConfirmBox");
    if(resendBox) resendBox.classList.add("hidden");
  },

  async doSignup(e){
    e.preventDefault();
    this.clearMsg();
    const name=$("signupName").value.trim();
    const email=$("signupEmail").value.trim();
    const password=$("signupPassword").value;
    const confirm=$("signupPasswordConfirm").value;
    if(password!==confirm){ this.showMsg("As senhas não coincidem.", "error"); return false; }
    const {error}=await supabaseClient.auth.signUp({
      email, password,
      options:{ data:{ full_name:name } }
    });
    if(error){ this.showMsg(this.translateError(error), "error"); return false; }
    $("signupSuccessEmail").textContent=email;
    this.showForm("signupSuccessBox");
    return false;
  },

  async doRecover(e){
    e.preventDefault();
    this.clearMsg();
    const email=$("recoverEmail").value.trim();
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split("#")[0]
    });
    if(error){ this.showMsg(this.translateError(error), "error"); return false; }
    this.showMsg("Enviamos um link de recuperação para o seu e-mail.", "success");
    return false;
  },

  async doSetNewPassword(e){
    e.preventDefault();
    this.clearMsg();
    const password=$("newPassword").value;
    const {error}=await supabaseClient.auth.updateUser({ password });
    if(error){ this.showMsg(this.translateError(error), "error"); return false; }
    this.showMsg("Senha atualizada com sucesso!", "success");
    return false;
  },

  async doGoogleLogin(){
    this.clearMsg();
    // Estrutura pronta — só funciona após ativar o provedor Google
    // em Authentication > Providers no painel do Supabase.
    const {error}=await supabaseClient.auth.signInWithOAuth({
      provider:"google",
      options:{ redirectTo: window.location.href.split("#")[0] }
    });
    if(error){ this.showMsg(this.translateError(error), "error"); }
  },

  async doLogout(){
    await supabaseClient.auth.signOut();
    // Recarrega para garantir que nenhum dado da sessão anterior
    // (state em memória do App) sobreviva no navegador.
    window.location.reload();
  },

  translateError(error){
    const msg=(error && error.message) || "";
    if(msg.includes("Invalid login credentials")) return "E-mail ou senha inválidos.";
    if(msg.includes("User already registered")) return "Este e-mail já está cadastrado.";
    if(msg.includes("Password should be at least")) return "A senha deve ter pelo menos 6 caracteres.";
    if(msg.includes("Email not confirmed")) return "Você ainda não confirmou seu e-mail. Confirme para poder entrar.";
    return msg || "Ocorreu um erro. Tente novamente.";
  }
};

Auth.init();
