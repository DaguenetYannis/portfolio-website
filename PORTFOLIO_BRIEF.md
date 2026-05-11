# Portfolio Architecture Brief

## Overview

This is an Astro-based static portfolio for institutional analytical work. The architecture is designed to be minimal, extensible, and performant.

## Directory Structure

### `/public`
Static files served as-is. Organized by content type:
- `outputs/` - Generated analysis outputs
  - `plots/` - Visualization exports
  - `diagrams/` - Flowcharts, architecture diagrams
  - `simulations/` - Simulation results
  - `exports/` - Data exports
- `static/` - Reference documents
  - `cv/` - Curriculum vitae
  - `documents/` - White papers, research papers

### `/src`

#### `components/`
Reusable Astro components:
- `layout/` - Page structure components (Header, Footer, Sidebar)
- `navigation/` - Navigation components (Menu, Breadcrumbs)
- `projects/` - Project-specific components
- `visuals/` - Data visualization components
- `ui/` - General UI components (Button, Card, etc.)

#### `pages/`
Astro file-based routing:
- `index.astro` - Homepage
- `about.astro` - About page
- `methods.astro` - Methodology documentation
- `projects/` - Individual project pages

#### `content/`
Structured content collection:
- `projects/` - Project metadata and descriptions (MDX/YAML)

#### `data/`
TypeScript data files:
- `projects.ts` - Projects data structure

#### `layouts/`
Layout templates for pages (e.g., `ProjectLayout.astro`)

#### `styles/`
Global styles and design system:
- `global.css` - Global styles and resets
- `tokens.css` - Design tokens (colors, spacing, typography)
- `typography.css` - Font definitions and text styles

#### `assets/`
Local assets (images, fonts) imported in components

## Design Decisions

1. **Static-first**: All content is pre-rendered at build time
2. **No database**: Project data in TypeScript/JSON files
3. **CSS Variables**: Tokens-based design system for theming
4. **Dark mode default**: Institutional aesthetic, respects system preferences
5. **Type-safe**: Full TypeScript support

## Extensibility

- Add new project pages in `src/pages/projects/`
- Add new components in `src/components/{category}/`
- Extend design tokens in `src/styles/tokens.css`
- Add new data sources in `src/data/`

## Next Steps

1. Define design tokens (colors, spacing, typography)
2. Create base layout component
3. Develop navigation structure
4. Build project listing and detail pages
5. Add content collections (if using content API)
