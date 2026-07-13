import React, { useEffect, useRef } from 'react';
import SwaggerUIBundle from 'swagger-ui-dist/swagger-ui-bundle.js';
import 'swagger-ui-dist/swagger-ui.css';
import PageHero from '../components/PageHero';
import { openApiSpec } from '../api-docs/openapi';

/**
 * Documentação interativa da API (Swagger UI), atrás do gate de sessão (AuthGate).
 * A página é lazy-loaded (ver App.tsx) → todo o bundle do swagger-ui-dist (~1MB) sai
 * num chunk separado. A spec é passada como objeto (não há arquivo público).
 */
const ApiDocs: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!ref.current || mounted.current) return; // guarda contra o double-invoke do StrictMode
    mounted.current = true;
    SwaggerUIBundle({
      spec: openApiSpec,
      domNode: ref.current,
      deepLinking: true,
      tryItOutEnabled: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  }, []);

  return (
    <>
      <PageHero
        eyebrow="Plataforma"
        title="Documentação da API"
        subtitle="Endpoints serverless do dashboard (OpenAPI 3.1). A maioria exige sessão — você já está logado."
      />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem 2rem 3rem' }}>
        {/* Swagger UI tem CSS próprio (claro); cartão branco para ler bem em ambos os temas */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div ref={ref} />
        </div>
      </div>
    </>
  );
};

export default ApiDocs;
