"use strict";

/* ================= AUTENTICAÇÃO (Supabase) — Fase 1 (auditada) ================= */

// ===== Configuração do Supabase =====
// Painel Supabase → seu projeto → Settings → API
//   Project URL      → cole entre as aspas de SUPABASE_URL
//   anon public key  → cole entre as aspas de SUPABASE_ANON_KEY
// Não use a "service_role key" aqui — ela nunca deve ficar no front-end.
const SUPABASE_URL = "https://qkktrdgwhjzhfzdjpmks.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UN0woH-nXlj8eGuSH0Qv7A_r_lGLPc8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Fluxo implícito: correto para este projeto porque é um SPA 100%
    // client-side, sem backend/rota de callback própria. O token vem
    // inteiro no fragmento da URL (#access_token=...) e não depende de
    // nada salvo previamente no navegador — por isso funciona mesmo
    // quando o link do e-mail é aberto em outro dispositivo/navegador
    // diferente do que iniciou o cadastro/recuperação.
    flowType: "implicit",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true   // processa automaticamente o token que vem no link do e-mail
  }
});
// ===== Fim da configuração do Supabase =====

// Ative para ver no console cada etapa do cadastro (início, dados enviados
// sem senha, resposta do Supabase). Desligue (false) antes de ir para produção.
const AUTH_DEBUG = true;
function authLog(...args){ if(AUTH_DEBUG) console.log("[FinPilot Auth]", ...args); }

const Auth = {
  appStarted: false,   // garante que App.init() só rode uma vez por sessão de página
  _initCalls: 0,        // conta quantas vezes init() rodou (deve ser sempre 1)
  _locks: { login:false, signup:false, recover:false, newPassword:false, resend:false },

  init(){
    this._initCalls++;
    if(this._initCalls > 1){
      console.warn("[FinPilot Auth] Auth.init() foi chamado", this._initCalls, "vezes — isso não deveria acontecer. Verifique se js/auth.js está incluído mais de uma vez no HTML.");
      return; // trava execuções extras em vez de registrar múltiplos listeners
    }

    // Detecta se o usuário chegou aqui vindo do link de confirmação de
    // cadastro do Supabase (o fluxo implícito coloca type=signup no
    // fragmento da URL: #...type=signup).
    const url = window.location.href;
    this.pendingConfirmation = /type=signup/.test(url);
    authLog("init() — url atual:", url, "| pendingConfirmation:", this.pendingConfirmation);

    supabaseClient.auth.onAuthStateChange((event, session)=>{
      authLog("onAuthStateChange:", event, session ? "(sessão presente)" : "(sem sessão)");
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

  // Trava um formulário durante uma chamada assíncrona: evita duplo-clique
  // ou duplo-submit disparando duas requisições ao Supabase.
  _setBusy(lockKey, formEl, busy){
    this._locks[lockKey]=busy;
    const btn = formEl ? formEl.querySelector('button[type="submit"]') : null;
    if(!btn) return;
    if(busy){
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Aguarde...";
    } else {
      btn.disabled = false;
      if(btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
    }
  },

  async doLogin(e){
    e.preventDefault();
    if(this._locks.login) return false; // já existe uma requisição em andamento
    this.clearMsg();
    const email=$("loginEmail").value.trim();
    const password=$("loginPassword").value;
    const resendBox=$("resendConfirmBox");
    if(resendBox) resendBox.classList.add("hidden");

    this._setBusy("login", e.target, true);
    const {error}=await supabaseClient.auth.signInWithPassword({email, password});
    this._setBusy("login", e.target, false);

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
    if(!this.lastLoginEmail || this._locks.resend) return;
    this._locks.resend=true;
    const {error}=await supabaseClient.auth.resend({
      type:"signup",
      email:this.lastLoginEmail,
      options:{ emailRedirectTo: window.location.origin }
    });
    this._locks.resend=false;
    if(error){ this.showMsg(this.translateError(error), "error"); return; }
    this.showMsg("E-mail de confirmação reenviado! Verifique também Spam e Promoções.", "success");
    const resendBox=$("resendConfirmBox");
    if(resendBox) resendBox.classList.add("hidden");
  },

  async doSignup(e){
    e.preventDefault();
    if(this._locks.signup){
      authLog("doSignup ignorado — já existe um cadastro em andamento (proteção contra duplo clique).");
      return false;
    }
    this.clearMsg();
    const name=$("signupName").value.trim();
    const email=$("signupEmail").value.trim();
    const password=$("signupPassword").value;
    const confirm=$("signupPasswordConfirm").value;
    if(password!==confirm){ this.showMsg("As senhas não coincidem.", "error"); return false; }

    authLog("doSignup: início");
    authLog("doSignup: dados enviados ->", { email, full_name:name, senha:"(oculta)" });

    this._setBusy("signup", e.target, true);
    const response = await supabaseClient.auth.signUp({
      email, password,
      options:{
        data:{ full_name:name },
        emailRedirectTo: window.location.origin
      }
    });
    this._setBusy("signup", e.target, false);

    const { data, error } = response;
    authLog("doSignup: resposta completa do Supabase ->", response);
    authLog("doSignup: data ->", data);
    authLog("doSignup: error ->", error);

    if(error){
      authLog("doSignup: falhou com erro ->", error.message, "(status:", error.status, ")");
      this.showMsg(this.translateError(error), "error");
      return false;
    }

    // Supabase pode retornar sucesso (sem "error") mas com data.user preenchido
    // e data.session nula quando a confirmação de e-mail é obrigatória — isso é
    // o comportamento esperado, não um bug.
    if(data && data.user && data.user.identities && data.user.identities.length===0){
      // Ocorre quando o e-mail já existe mas está associado a outro provedor
      // (ex: Google) — o Supabase não avisa via "error" nesse caso específico.
      authLog("doSignup: e-mail já vinculado a uma conta existente (identities vazio).");
      this.showMsg("Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.", "error");
      return false;
    }

    authLog("doSignup: sucesso — usuário criado, aguardando confirmação de e-mail.");
    $("signupSuccessEmail").textContent=email;
    this.showForm("signupSuccessBox");
    return false;
  },

  async doRecover(e){
    e.preventDefault();
    if(this._locks.recover) return false;
    this.clearMsg();
    const email=$("recoverEmail").value.trim();

    this._setBusy("recover", e.target, true);
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    this._setBusy("recover", e.target, false);

    if(error){ this.showMsg(this.translateError(error), "error"); return false; }
    this.showMsg("Enviamos um link de recuperação para o seu e-mail.", "success");
    return false;
  },

  async doSetNewPassword(e){
    e.preventDefault();
    if(this._locks.newPassword) return false;
    this.clearMsg();
    const password=$("newPassword").value;

    this._setBusy("newPassword", e.target, true);
    const {error}=await supabaseClient.auth.updateUser({ password });
    this._setBusy("newPassword", e.target, false);

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
      options:{ redirectTo: window.location.origin }
    });
    if(error){ this.showMsg(this.translateError(error), "error"); }
  },

  async doLogout(){
    await supabaseClient.auth.signOut();
    // Recarrega para garantir que nenhum dado da sessão anterior
    // (state em memória do App) sobreviva no navegador.
    window.location.reload();
  },

  // Nunca retorna a mensagem crua do Supabase — sempre traduz para uma
  // mensagem amigável em português. Nenhum texto técnico chega ao usuário.
  translateError(error){
    const msg=(error && error.message) || "";
    const status=(error && error.status) || null;

    if(/invalid login credentials/i.test(msg)) return "E-mail ou senha inválidos.";
    if(/user already registered/i.test(msg)) return "Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.";
    if(/password should be at least/i.test(msg)) return "A senha deve ter pelo menos 6 caracteres.";
    if(/email not confirmed/i.test(msg)) return "Você ainda não confirmou seu e-mail. Confirme para poder entrar.";
    if(/rate limit|too many requests|for security purposes/i.test(msg) || status===429){
      return "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.";
    }
    if(/invalid email/i.test(msg)) return "Digite um e-mail válido.";
    if(/network/i.test(msg)) return "Não foi possível conectar. Verifique sua internet e tente novamente.";

    // Nunca expor `msg` cru aqui — mensagem genérica para qualquer caso não mapeado.
    authLog("translateError: mensagem não mapeada (log interno apenas) ->", msg);
    return "Ocorreu um erro ao processar sua solicitação. Tente novamente em instantes.";
  }
};

Auth.init();
