export const themeInitScript = `(function(){try{
  var p = localStorage.getItem('ace-aws/prefs/v1');
  var t = p ? JSON.parse(p).state.theme : 'system';
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();`
