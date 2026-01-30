let defaultTarget = 'https://biblia.capuchinhos.org/';
module.exports = [
   {
      context: ['/v1/**'],
      target: defaultTarget,
      changeOrigin: true,
   }
];
