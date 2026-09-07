// Default to the public API so a fresh checkout works out of the box.
// Point API_PROXY_TARGET at a local backend when developing against one, e.g.
//   API_PROXY_TARGET=http://localhost:3000/ npm start
const defaultTarget =
   process.env.API_PROXY_TARGET || 'https://biblia.capuchinhos.org/';
module.exports = [
   {
      context: ['/v1/**'],
      target: defaultTarget,
      changeOrigin: true,
      secure: false,
   }
];
