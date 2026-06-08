# Cloudflare Tunnel - InfraFlow Demo

## Prerequisite

- Cloudflare account cu domeniu `appnode.ro` sau `infraflow.ro`
- `cloudflared.exe` instalat: https://github.com/cloudflare/cloudflared/releases
- Serverul demo ruleaza pe `http://localhost:4190`

## Metoda 1 - Tunel temporar

```cmd
cloudflared tunnel --url http://localhost:4190
```

Cloudflared genereaza automat un URL de tipul:

```text
https://random-name-123.trycloudflare.com
```

Trimite acest URL clientului. Expira la oprirea procesului.

## Metoda 2 - Tunel persistent cu subdomeniu propriu

### Pas 1 - Autentificare

```cmd
cloudflared login
```

### Pas 2 - Creare tunel

```cmd
cloudflared tunnel create infraflow-demo
```

### Pas 3 - Config tunel

Creeaza fisierul `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: abc123-def456-...
credentials-file: C:\Users\costy\.cloudflared\abc123-def456-....json

ingress:
  - hostname: demo.appnode.ro
    service: http://localhost:4190
  - service: http_status:404
```

### Pas 4 - DNS Route

```cmd
cloudflared tunnel route dns infraflow-demo demo.appnode.ro
```

### Pas 5 - Pornire tunel

```cmd
cloudflared tunnel run infraflow-demo
```

## URL final demo

`https://demo.appnode.ro` -> `http://localhost:4190`

## Pornire completa demo

1. Pornire server: `.\scripts\windows\start-demo.ps1`
2. Pornire tunel: `cloudflared tunnel run infraflow-demo`
3. URL demo: `https://demo.appnode.ro`

## Oprire

Ctrl+C in ambele ferestre PowerShell/CMD.
