---
name: git credential.helper con variable de entorno
description: Configurar git para leer PAT desde env var sin exponerlo en URLs ni .git/config — reglas validadas y errores cometidos documentados.
---

# git credential.helper con variable de entorno

## Regla canónica (mecanismo validado)

Usar un **script auxiliar en /tmp** — evita cualquier ambigüedad de quoting y permite limpiar whitespace:

```bash
cat > /tmp/git-credential-helper.sh << 'EOF'
#!/bin/sh
echo "username=token"
printf "password=%s\n" "$(printenv GITHUB_PAT_RODRIGO | tr -d '[:space:]')"
EOF
chmod +x /tmp/git-credential-helper.sh
git config --global credential.helper '/tmp/git-credential-helper.sh'
```

Verificar que `git config --global --list | grep credential` muestra la ruta del script (no el token).

## Alternativa inline (también válida, más frágil con quoting)

```bash
git config --global credential.helper '!f() { echo "username=token"; echo "password=$GITHUB_PAT_RODRIGO"; }; f'
```

Con comillas **simples**: `.gitconfig` almacena la cadena literal `$GITHUB_PAT_RODRIGO` → git la expande al invocar el helper.
Con comillas **dobles**: el shell expande `$GITHUB_PAT_RODRIGO` en el momento de escribir → token literal queda en `.gitconfig` → expuesto en `git config --global --list`. **Nunca usar dobles.**

## Invariantes de configuración

- Remote URL siempre limpia: `https://github.com/Rodrigo-RP/EduPay.git` (sin token embebido)
- `git remote set-url github https://github.com/Rodrigo-RP/EduPay.git` para limpiar si quedó sucia
- Remote target: **`github`** (no `origin`); push siempre con `git push github replit-en-vivo`
- `origin` apunta a `Referencee-io/EduPay` — repo sin continuidad, sin permiso de escritura. Nunca hacer push ahí.

## Antes de mostrar `git remote -v`

**SIEMPRE verificar visualmente la salida antes de pegarla al usuario.** Si alguna URL contiene `@`, contiene credenciales en texto plano — no mostrar. Describir el resultado en prosa en su lugar.

## Validar longitud del token antes de push

GitHub PATs:
- Classic (`ghp_`): ~40 caracteres
- Fine-grained (`github_pat_`): ~93 caracteres

```bash
echo -n "$GITHUB_PAT_RODRIGO" | tr -d '[:space:]' | wc -c
```

Si el resultado es > 150: el secret contiene contenido extra (URL, JSON, newlines). Solicitar de nuevo con `requestSecrets` y pedir solo el token desnudo.

**Por qué:** el formulario `requestSecrets` guarda literalmente lo que el usuario pega. Si pegó la URL del repo o el token con whitespace, el valor almacenado es incorrecto y GitHub lo rechazará con "invalid credentials".

## Scope requerido del PAT

Fine-grained: **Contents: Read and write** sobre `Rodrigo-RP/EduPay`.
Classic: scope `repo`.

Si el push devuelve 403 "Permission denied to Rodrigo-RP" con el remote correcto y token válido: el PAT no tiene el scope correcto — hay que revocarlo y generar uno nuevo.
