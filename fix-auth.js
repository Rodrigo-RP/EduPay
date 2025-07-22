// Script para limpiar localStorage y forzar migración completa a Instituto JFR
localStorage.clear();
localStorage.setItem('institution_name', 'Instituto JFR');
localStorage.setItem('campus_name', 'Campus Principal');
console.log('✅ localStorage limpiado completamente');
console.log('✅ Institución actualizada a: Instituto JFR');
setTimeout(() => { window.location.reload(); }, 1000);
