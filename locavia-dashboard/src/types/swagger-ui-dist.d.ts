// swagger-ui-dist não publica tipos; declarações mínimas para o bundle e o CSS.
declare module 'swagger-ui-dist/swagger-ui-bundle.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SwaggerUIBundle: any;
  export default SwaggerUIBundle;
}
declare module 'swagger-ui-dist/swagger-ui.css';
