// Script temporal para establecer el token de autenticación correcto
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjYsImVtYWlsIjoiYWRtaW5Ac2FucGF0cmljaW8uZWR1Lm14Iiwicm9sZSI6ImFkbWluIiwiY2FtcHVzX2lkIjoyNCwidHlwZSI6InVzZXIiLCJpYXQiOjE3NTMyMDM3MzUsImV4cCI6MTc1MzI5MDEzNX0.4jP8ECb3QgiyaO1tCKg4rM9vBw20D945fs09vAs4to4";
const user = {
  "id": 26,
  "email": "admin@sanpatricio.edu.mx",
  "role": "admin",
  "campus_id": 24
};

localStorage.setItem('auth_token', token);
localStorage.setItem('auth_user', JSON.stringify(user));
localStorage.setItem('auth_type', 'user');

console.log('Tokens establecidos exitosamente');
console.log('Token:', token.substring(0, 50) + '...');
console.log('User:', user);

// Recargar la página para aplicar los cambios
setTimeout(() => {
  window.location.reload();
}, 1000);