"use strict";

/* ================= AUTENTICAÇÃO (Supabase) — Fase 1 (auditada) ================= */

// Captura a URL original ANTES de criar o client — supabase.createClient()
// já dispara processamento interno da URL (detectSessionInUrl), que pode
// limpar o hash antes que nosso código tivesse chance de lê-la depois.
const INITIAL_URL = window.location.href;

// [RECOVERY DEBUG] Instrumentação temporária para diagnóstico do fluxo de
// recuperação de senha. Remover após a investigação. Mascara valores
// sensíveis (tokens/código/senha) de uma URL antes de logar — mostra só
// protocolo + domínio + caminho + nomes dos parâmetros (e valores não
// sensíveis, como "type").
function maskUrlForLog(rawUrl){
  const SENSITIVE_KEYS = /^(access_token|refresh_token|provider_token|provider_refresh_token|code|password)$/i;
  try{
    const u = new URL(rawUrl);
    const maskPart = (str)=>{
      if(!str) return "(vazio)";
      return str.split("&").map(pair=>{
        const idx = pair.indexOf("=");
        if(idx===-1) return pair;
        const key = pair.slice(0, idx);
        const val = pair.slice(idx+1);
        return SENSITIVE_KEYS.test(key) ? key+"=***" : key+"="+val;
      }).join("&");
    };
    const hash = u.hash ? u.hash.slice(1) : "";
    const search = u.search ? u.search.slice(1) : "";
    return u.origin+u.pathname+" | search:["+maskPart(search)+"] | hash:["+maskPart(hash)+"]";
  } catch(e){
    return "(não foi possível parsear a URL)";
  }
}
console.log("[RECOVERY DEBUG] INITIAL_URL capturada:", maskUrlForLog(INITIAL_URL));
console.log("[RECOVERY DEBUG] INITIAL_URL contém type=recovery?", /type=recovery/.test(INITIAL_URL));

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
    const url = INITIAL_URL;
    this.pendingConfirmation = /type=signup/.test(url);
    // Mesma ideia para o link de recuperação de senha (#...type=recovery).
    // Serve como sinal inicial; o evento PASSWORD_RECOVERY abaixo é a
    // fonte de verdade definitiva e também marca esta flag.
    this.pendingRecovery = /type=recovery/.test(url);
    authLog("init() — url atual:", url, "| pendingConfirmation:", this.pendingConfirmation, "| pendingRecovery:", this.pendingRecovery);
    console.log("[RECOVERY DEBUG] Auth.init() — estado inicial:", {
      pendingConfirmation: this.pendingConfirmation,
      pendingRecovery: this.pendingRecovery,
      INITIAL_URL: maskUrlForLog(INITIAL_URL)
    });

    supabaseClient.auth.onAuthStateChange((event, session)=>{
      authLog("onAuthStateChange:", event, session ? "(sessão presente)" : "(sem sessão)");
      console.log("[RECOVERY DEBUG] onAuthStateChange disparado:", {
        event: event,
        temSession: !!session,
        pendingConfirmation: this.pendingConfirmation,
        pendingRecovery: this.pendingRecovery
      });
      if(event==="PASSWORD_RECOVERY"){
        this.pendingRecovery = true;
        this.hideChecking();
        showView("auth");
        console.log("[RECOVERY DEBUG] Caminho PASSWORD_RECOVERY — chamando showForm(\"newPasswordForm\") agora.");
        this.showForm("newPasswordForm");
        return;
      }
      if(session){
        if(this.pendingConfirmation){
          this.pendingConfirmation=false;
          this.hideChecking();
          showView("auth");
          this.showForm("emailConfirmedView");
          return;
        }
        if(this.pendingRecovery){
          // Ainda em contexto de recuperação de senha (ex: TOKEN_REFRESHED
          // disparando enquanto o usuário está parado em newPasswordForm).
          // Não deixar ir para o Dashboard enquanto a senha não for definida.
          console.log("[RECOVERY DEBUG] onAuthStateChange: sessão presente mas pendingRecovery=true — onAuthenticated() BLOQUEADO neste caminho.");
          return;
        }
        console.log("[RECOVERY DEBUG] onAuthStateChange: nenhuma guarda ativa — chamando onAuthenticated() a partir daqui (caminho A).");
        this.onAuthenticated(session);
      }
      else if(event==="SIGNED_OUT" || event==="INITIAL_SESSION"){ this.onSignedOut(); }
    });

    supabaseClient.auth.getSession().then(({data})=>{
      const podeAutenticar = !!(data.session && !this.pendingConfirmation && !this.pendingRecovery);
      console.log("[RECOVERY DEBUG] getSession().then() resolveu:", {
        temSession: !!data.session,
        pendingConfirmation: this.pendingConfirmation,
        pendingRecovery: this.pendingRecovery,
        condicaoParaOnAuthenticated: podeAutenticar
      });
      if(data.session && !this.pendingConfirmation && !this.pendingRecovery){
        console.log("[RECOVERY DEBUG] getSession(): condição verdadeira — chamando onAuthenticated() a partir daqui (caminho B).");
        this.onAuthenticated(data.session);
      }
      else if(!data.session){ this.onSignedOut(); }
      // se houver sessão E pendingConfirmation/pendingRecovery, o onAuthStateChange acima já cuidou da tela.
    });
  },

  // Chamado pelo botão "Entrar no FinPilot BI" da tela de conta ativada.
  continueAfterConfirmation(){
    this.hideChecking();
    supabaseClient.auth.getSession().then(({data})=>{
      if(data.session){
        console.log("[RECOVERY DEBUG] continueAfterConfirmation(): chamando onAuthenticated() a partir daqui (caminho C — clique manual do usuário).");
        this.onAuthenticated(data.session);
      }
    });
  },

  onAuthenticated(session){
    console.log("[RECOVERY DEBUG] onAuthenticated() FOI CHAMADO.", {
      pendingRecoveryNesteMomento: this.pendingRecovery,
      email: session && session.user ? session.user.email : "(sem email)"
    });
    this.hideChecking();
    const emailEl=$("sidebarUserEmail");
    if(emailEl){ emailEl.textContent=session.user.email||""; emailEl.title=session.user.email||""; }
    if(!this.appStarted){
      this.appStarted=true;
      // Só troca de tela (authView -> uploadView) na PRIMEIRA autenticação
      // desta página. Eventos subsequentes com sessão (ex: TOKEN_REFRESHED,
      // que pode disparar ao voltar para uma aba em segundo plano) não devem
      // reabrir uploadView por cima da tela em que o usuário já está
      // (ex: appView/dashboard) — essa era a causa da sobreposição de views.
      showView("upload");
      console.log("[RECOVERY DEBUG] App.init() será executado");
      App.init();
    }
  },

  onSignedOut(){
    this.hideChecking();
    clearFinancialState();
    showView("auth");
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
      // (ex: login social) — o Supabase não avisa via "error" nesse caso específico.
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
    this.showMsg("Senha alterada com sucesso! Sua senha foi atualizada. Agora você já pode entrar na sua conta.", "success");
    this.pendingRecovery = false;
    setTimeout(async ()=>{
      await supabaseClient.auth.signOut();
      this.showLogin();
    }, 1800);
    return false;
  },

  async doLogout(){
    clearFinancialState();
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
