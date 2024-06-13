let defaultTarget = 'http://localhost:3000/';
module.exports = [
{
   context: ['/v1/**'],
   target: defaultTarget,
   changeOrigin: true,
}
];