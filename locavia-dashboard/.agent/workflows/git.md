---
description: Como inicializar, salvar e sincronizar o projeto usando Git
---

# Git Workflow - Locavia Dashboard

Este guia detalha como manter seu código seguro e compartilhado via Git.

## 🏁 Inicialização (Apenas na Primeira Vez)

Se o projeto ainda não tem um repositório Git, siga estes passos:

// turbo
1. **Inicializar o Repositório:** 
   Execute `git init` na pasta raiz.

2. **Adicionar Arquivos:**
   Execute `git add .` para preparar os arquivos (o `.gitignore` já cuidará do que não deve subir).

3. **Primeiro Commit:**
   Execute `git commit -m "feat: setup inicial do projeto"`

## ☁️ Conexão Remota (GitHub/GitLab/Bitbucket)

Para salvar seu código na nuvem:

1. **Criar Repositório:** Crie um novo repositório vazio no seu provedor de Git.
2. **Conectar e Enviar:**
   Substitua `[URL_DO_REPO]` pela URL do seu repositório:
   ```bash
   git remote add origin [URL_DO_REPO]
   git branch -M main
   git push -u origin main
   ```

## 🔄 Fluxo de Trabalho Diário

Sempre que terminar uma funcionalidade ou correção:

1. **Verificar Alterações:**
   Execute `git status`

2. **Salvar e Commitar:**
   // turbo
   Execute `git add .` seguido de `git commit -m "mensagem descrevendo o que foi feito"`

3. **Enviar para a Nuvem:**
   Execute `git push`

## 📥 Receber Atualizações

Se outra pessoa (ou você em outra máquina) subiu código:

// turbo
Execute `git pull origin main`
