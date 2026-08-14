---
name: git credential.helper con variable de entorno
description: Configurar git para leer PAT desde env var sin exponerlo en URLs ni .git/config — requiere comillas simples obligatoriamente.
---

# git credential.helper con variable de entorno

## Regla

Usar **comillas simples** al configurar el credential.helper con una variable de entorno:

```bash
git config --global credential.helper '!f() { echo username=Rodrigo-RP; echo password=$GITHUB_PAT_RODRIGO; }; f'
```

## Por qué

Con comillas dobles, el shell expande `$GITHUB_PAT_RODRIGO` en el momento de escribir la configuración → el token literal queda en `~/.gitconfig` → se expone en `git config --global --list`.

Con comillas simples, el shell NO expande → `.gitconfig` almacena la cadena literal `$GITHUB_PAT_RODRIGO` → git la expande al invocar el helper, cuando la variable ya está disponible desde el entorno (Replit Secret).

**Prueba en seco recomendada antes de usar el token real:** configurar con una variable ficticia (`GITHUB_PAT_TEST=valor_inventado`) y verificar que `git config --global --list` muestra la cadena literal, no el valor expandido.

## Cómo aplicar

- Remote URL siempre limpia: `https://github.com/Rodrigo-RP/EduPay.git` (sin token)
- Secret guardado como `GITHUB_PAT_RODRIGO` en Replit Secrets
- Remote target: `github` (no `origin`); push con `git push github replit-en-vivo`
- Si el push devuelve 403 "denied to Rodrigo-RP": el PAT no tiene scope correcto (necesita `repo` classic o `Contents: Read and Write` fine-grained sobre el repo específico), no es problema de git config
