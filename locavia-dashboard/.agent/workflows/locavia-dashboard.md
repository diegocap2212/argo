---
description: Como configurar, rodar e evoluir o Locavia Dashboard em qualquer ambiente
---

# Estrutura do Locavia Dashboard

Este projeto é uma aplicação Web (React/Vite) projetada para visualizar a vazão (Cone) das squads da Locavia. A arquitetura é resiliente e preparada para transição de Excel -> API do Jira.

## 🛠️ Setup Inicial (Novas Máquinas)

Se você estiver baixando este projeto pela primeira vez em uma nova máquina, siga estes passos:

1. **Instalar Node.js:** Certifique-se de ter o Node.js v18 ou superior instalado.
2. **Instalar Dependências:**
   // turbo
   Execute `npm install` na raiz do projeto (`locavia-dashboard`).
3. **Verificar Dados:** O arquivo `src/data.json` deve conter os dados exportados do Jira.

## 🚀 Como Rodar o Dashboard Localmente

Para visualizar o Dashboard e interagir com os gráficos:

// turbo
1. Execute o comando: `npm run dev`
2. Acesse o link gerado: [http://localhost:5173](http://localhost:5173)

## 📊 Atualização de Dados (Manual via Excel)

Enquanto a API não estiver conectada:
1. Exporte a aba **BASE CONE** do seu Jira/Excel principal para CSV ou direto para JSON.
2. Certifique-se de que os campos (Key, Summary, Status, Team, Created, Resolved, Release) estejam presentes.
3. Substitua o conteúdo de `src/data.json` com os novos dados. O Dashboard atualizará o Cone e as métricas automaticamente.

## 🔗 Evolução para API do Jira

Quando você tiver o API Token:
1. No arquivo `src/App.tsx`, localize o comentário `// Future JQL/XML support`.
2. Implemente o fetch apontando para seu endpoint do Jira.
3. A função `normalizeJqlData` cuidará de manter o gráfico e as métricas estáveis, mesmo se o formato do JSON da API mudar.

## ⚠️ Governança e Melhores Práticas

- Sempre consulte o [Guia de Preenchimento](file:///C:/Users/Usuario/.gemini/antigravity/brain/ddbd9bff-355f-4901-8dc0-887c99a22c0d/guia_jira.md) para garantir que o time não gere ruídos.
- Verifique o card **Qualidade dos Dados** no Dashboard para identificar itens "Done" sem data de resolução.
