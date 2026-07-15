// Simple front-end auth manager for static GitHub Pages
(function(){
    const USERS_KEY = 'site_users_v1';
    const CURRENT_USER_KEY = 'site_current_user_v1';
    const LOGS_KEY = 'site_auth_logs_v1';
    const PROTECTED_PASSWORDS_KEY = 'site_protected_passwords_v1';
    const FILE_DB = 'site_protected_files';
    const FILE_STORE = 'files';

    async function fetchInitialUsers(){
        try{
            const r = await fetch('users.json', {cache: 'no-store'});
            if(!r.ok) return;
            const j = await r.json();
            const stored = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
            if(!stored){
                localStorage.setItem(USERS_KEY, JSON.stringify(j.users || []));
            } else {
                const users = stored;
                const defaults = j.users || [];
                let changed = false;
                for(const defUser of defaults){
                    if(!users.some(u => u.username === defUser.username)){
                        users.push(defUser);
                        changed = true;
                    }
                }
                if(changed){
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
        const currentUser = {username: user.username, isAdmin: false, when: new Date().toISOString()};
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        await recordEvent('register', username);
        return {ok:true, user};
    }

    window.loginUser = async function(username, password){
        username = (username||'').trim();
        const u = findUser(username);
        if(!u) return {ok:false, msg:'用户不存在'};
        if(u.password !== password) return {ok:false, msg:'密码错误'};
        const currentUser = {username: u.username, isAdmin: !!u.isAdmin, when: new Date().toISOString()};
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        await recordEvent('login', username);
        return {ok:true, user: u};
    }

    window.logout = function(){
        localStorage.removeItem(CURRENT_USER_KEY);
        sessionStorage.removeItem('currentUser');
        Object.keys(sessionStorage).filter(k=>k.indexOf('protected:')===0).forEach(k=>sessionStorage.removeItem(k));
        location.href = 'index.html';
    }

    window.getCurrentUser = function(){
        return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || sessionStorage.getItem('currentUser') || 'null');
    }

    window.updateAuthNav = function() {
        const cur = getCurrentUser();
        const registerLink = document.getElementById('register-link');
        const loginLink = document.getElementById('login-link');
        const adminLink = document.getElementById('admin-link');
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
        if(adminLink){
            if(cur && cur.isAdmin){
                adminLink.style.display = 'inline-block';
            } else {
                adminLink.style.display = 'none';
            }
        }
    }

    window.requireAuth = function(){
        const cur = getCurrentUser();
        if(!cur){
            location.href = 'login.html';
        }
    }

    window.requireAdmin = function(){
        const cur = getCurrentUser();
        if(!cur || cur.username!=='thanatoszhang'){
            location.href = '404.html';
        }
    }

    // Protected pages helpers
    function getProtectedPasswordMap(){
        return JSON.parse(localStorage.getItem(PROTECTED_PASSWORDS_KEY) || '{}');
    }
    function setProtectedPasswordMap(map){
        localStorage.setItem(PROTECTED_PASSWORDS_KEY, JSON.stringify(map));
    }
    window.getProtectedPassword = function(page){
        const map = getProtectedPasswordMap();
        const defaults = {magazine: 'magazine-access', audio: 'audio-access'};
        return map[page] || defaults[page] || '';
    }
    window.setProtectedPassword = function(page, password){
        const map = getProtectedPasswordMap();
        map[page] = password;
        setProtectedPasswordMap(map);
        return password;
    }
    window.unlockProtectedPage = function(page){ sessionStorage.setItem('protected:' + page, 'true'); }
    window.lockProtectedPage = function(page){ sessionStorage.removeItem('protected:' + page); }
    window.isProtectedPageUnlocked = function(page){ return sessionStorage.getItem('protected:' + page) === 'true'; }
    window.verifyProtectedPassword = function(page, entered){ return (entered||'').trim() === window.getProtectedPassword(page); }
    window.canAccessProtectedPage = function(page){ return !!window.getCurrentUser() && window.isProtectedPageUnlocked(page); }

    function openFileDB(){
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(FILE_DB, 1);
            req.onupgradeneeded = function(){
                const db = req.result;
                if(!db.objectStoreNames.contains(FILE_STORE)){
                    const store = db.createObjectStore(FILE_STORE, {keyPath: 'id'});
                    store.createIndex('page', 'page', {unique: false});
                }
            };
            req.onsuccess = function(){ resolve(req.result); };
            req.onerror = function(){ reject(req.error); };
        });
    }
    window.getProtectedFiles = async function(page){
        const db = await openFileDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILE_STORE, 'readonly');
            const store = tx.objectStore(FILE_STORE);
            const index = store.index('page');
            const req = index.getAll(page);
            req.onsuccess = function(){ resolve(req.result || []); };
            req.onerror = function(){ reject(req.error); };
        });
    }
    window.addProtectedFile = async function(page, file){
        if(!file) throw new Error('No file selected');
        if(file.size > 23 * 1024 * 1024) throw new Error('File exceeds 23MB');
        const db = await openFileDB();
        const record = {id: Date.now() + '-' + Math.random().toString(16).slice(2), page, name: file.name, type: file.type, size: file.size, data: file};
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILE_STORE, 'readwrite');
            tx.objectStore(FILE_STORE).put(record);
            tx.oncomplete = function(){ resolve(record); };
            tx.onerror = function(){ reject(tx.error); };
        });
    }
    window.deleteProtectedFile = async function(id){
        const db = await openFileDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILE_STORE, 'readwrite');
            tx.objectStore(FILE_STORE).delete(id);
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = function(){ reject(tx.error); };
        });
    }

    window.ensureMagazinePresetFiles = async function(){
        const existing = await window.getProtectedFiles('magazine');
        const names = new Set(existing.map(f => (f.name || '').toLowerCase()));
        const presets = [
            {name: 'The Economist USA 06.27.2026.pdf', path: 'files/The%20Economist%20USA%2006.27.2026.pdf'},
            {name: 'The Atlantic 06.2026.pdf', path: 'files/The%20Atlantic%2006.2026.pdf'},
            {name: '四六级生词表.pdf', path: 'files/%E5%9B%9B%E5%85%AD%E7%BA%A7%E7%94%9F%E8%AF%8D%E8%A1%A8.pdf'}
        ];

        for (const preset of presets) {
            if(names.has(preset.name.toLowerCase())) continue;
            try {
                const res = await fetch(preset.path, {cache: 'no-store'});
                if(!res.ok) continue;
                const blob = await res.blob();
                const file = new File([blob], preset.name, {type: blob.type || 'application/pdf'});
                await window.addProtectedFile('magazine', file);
                names.add(preset.name.toLowerCase());
            } catch (err) {
                console.warn('Failed to seed preset magazine file', preset.name, err);
            }
        }
    };

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

    fetchInitialUsers();

    window.getAuthLogs = function(){ return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]'); }
    window.clearAuthLogs = function(){ localStorage.removeItem(LOGS_KEY); }

})();
