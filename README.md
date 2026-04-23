# Vantage — Entrepreneurial OS

> See everything. Move fast. Own the outcome.

Vantage is a project pipeline tracker built for entrepreneurs who run multiple projects simultaneously. It gives you a bird's-eye view of every project, at every stage, with all the context you need to move fast.

## Features

- **Pipeline board** — 8-stage project pipeline (Idea → Conversation → Plan → Evaluate → Initiate → In Progress → Complete → Goal ★)
- **Drag & drop** — move projects between stages by dragging or using the Move menu
- **Per-project sub-whiteboards** — each project has its own internal pipeline with custom stages
- **Ticket system** — Linear-style To do / In progress / Done board per project
- **Contacts** — track relationships (team, investor, partner, client, vendor, press)
- **Finances** — revenue, expenses, investments, and net per project
- **Conversation tab** — structured notes on goal, ideas, financing, marketing, team, timeline, risks, and action items
- **Team access** — invite collaborators with viewer or editor permissions, visible or hidden

## Deployment

This is a single-file static app — no build step, no dependencies, no backend required.

### GitHub Pages setup

1. Create a new repo: `github.com/madmyron/vantage`
2. Add `index.html` to the root
3. Go to **Settings → Pages → Source → Deploy from branch → main → / (root)**
4. Point your custom domain `vantagewb.com` to GitHub Pages via your DNS provider

### Custom domain (vantagewb.com)

In your DNS provider, add:
```
Type: CNAME
Name: www
Value: madmyron.github.io
```
And in GitHub Pages settings, set custom domain to `vantagewb.com`.

## Roadmap

- [ ] Supabase backend — persist data across sessions
- [ ] Google OAuth — multi-user accounts
- [ ] Shared project boards — real-time collaboration
- [ ] Mobile layout
- [ ] Export to PDF / CSV

## Built by

Michael D'Asaro · [vantagewb.com](https://vantagewb.com)
