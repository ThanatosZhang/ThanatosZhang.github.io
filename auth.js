// Simple front-end auth manager for static GitHub Pages
(function(){
    const USERS_KEY = 'site_users_v1';
    const LOGS_KEY = 'site_auth_logs_v1';

    async function fetchInitialUsers(){
        try{
            const r = await fetch('users.json', {cache: 'no-store'});
            if(!r.ok) return;
            const j = await r.json();
            const stored = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
            if(!stored){
                localStorage.setItem(USERS_KEY, JSON.stringify(j.users || []));
            } else {
                // ensure admin exists
                const users = stored;
                const adminExists = users.some(u=>u.username==='thanatoszhang');
                if(!adminExists){
                    users.push(...(j.users||[]));
                    localStorage.setItem(USERS_KEY, JSON.stringify(users));
                }
            }
        }catch(e){console.warn('Could not load users.json', e)}
    }

    function getUsers(){
        return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    }
    function setUsers(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

    async function getIpLocation(){
        try{
            const r = await fetch('https://ipapi.co/json/');
            if(!r.ok) throw 0;
            return await r.json();
        }catch(e){
            return {ip: 'unknown'};
        }
    }

    async function recordEvent(type, username){
        const loc = await getIpLocation();
        const logs = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
        logs.push({type, username, when: new Date().toISOString(), ip: loc.ip || 'unknown', city: loc.city||'', region: loc.region||'', country: loc.country_name||''});
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    }

    function findUser(username){
        return getUsers().find(u=>u.username===username);
    }

    window.registerUser = async function(username, password){
        username = (username||'').trim();
        if(!username || !password) return {ok:false, msg:'用户名和密码不能为空'};
        const users = getUsers();
        if(users.some(u=>u.username===username)) return {ok:false, msg:'用户名已存在'};
        const user = {username, password, createdAt: new Date().toISOString(), isAdmin: false};
        users.push(user);
        setUsers(users);
        await recordEvent('register', username);
        return {ok:true, user};
    }

    window.loginUser = async function(username, password){
        username = (username||'').trim();
        const u = findUser(username);
        if(!u) return {ok:false, msg:'用户不存在'};
        if(u.password !== password) return {ok:false, msg:'密码错误'};
        sessionStorage.setItem('currentUser', JSON.stringify({username: u.username, isAdmin: !!u.isAdmin, when: new Date().toISOString()}));
        await recordEvent('login', username);
        return {ok:true, user: u};
    }

    window.logout = function(){ sessionStorage.removeItem('currentUser'); location.href = 'index.html'; }

    window.getCurrentUser = function(){ return JSON.parse(sessionStorage.getItem('currentUser')||'null'); }

    window.updateAuthNav = function() {
        const cur = getCurrentUser();
        const registerLink = document.getElementById('register-link');
        const loginLink = document.getElementById('login-link');
        if (registerLink && loginLink) {
            if (cur) {
                registerLink.textContent = 'Logout';
                registerLink.href = '#';
                registerLink.onclick = function(e){ e.preventDefault(); logout(); };
                loginLink.textContent = 'Home';
                loginLink.href = 'index.html';
                loginLink.onclick = null;
            } else {
                registerLink.textContent = 'Register';
                registerLink.href = 'register.html';
                registerLink.onclick = null;
                loginLink.textContent = 'Login';
                loginLink.href = 'login.html';
                loginLink.onclick = null;
            }
        }
    }

    window.requireAuth = function(){
        const cur = getCurrentUser();
        if(!cur){
            // redirect to login
            location.href = 'login.html';
        }
    }

    window.requireAdmin = function(){
        const cur = getCurrentUser();
        if(!cur || cur.username!=='thanatoszhang'){
            // return 404 page to mimic forbidden
            location.href = '404.html';
        }
    }

    // Admin helpers
    window.adminListUsers = function(){ return getUsers(); }
    window.adminDeleteUser = function(username){
        let users = getUsers();
        users = users.filter(u=>u.username!==username);
        setUsers(users);
    }
    window.adminUpdateUser = function(username, newData){
        const users = getUsers();
        const idx = users.findIndex(u=>u.username===username);
        if(idx===-1) return false;
        users[idx] = Object.assign(users[idx], newData);
        setUsers(users);
        return true;
    }

    window.exportUsersFile = function(){
        const data = JSON.stringify({users: getUsers()}, null, 2);
        const blob = new Blob([data], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'users-export.json'; a.click();
        URL.revokeObjectURL(url);
    }

    // Merge initial users.json on load
    fetchInitialUsers();

    // expose logs
    window.getAuthLogs = function(){ return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]'); }
    window.clearAuthLogs = function(){ localStorage.removeItem(LOGS_KEY); }

})();
