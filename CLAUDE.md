# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SillyTavern extension called "记忆增强插件" (Memory Enhancement Plugin) that provides structured long-term memory capabilities for AI characters in SillyTavern. The extension uses a table-based memory system to store and manage character information, events, and context across conversations.

**Key Features:**
- Structured table-based memory storage system
- Dynamic table editing via AI-generated commands
- Template-based table configuration
- Multi-language support (Chinese, English)
- Real-time memory injection into AI prompts
- Custom rendering and styling for tables

## Development Commands

**TypeScript Compilation:**
```bash
npx tsc
```

**No package.json found** - This is a client-side JavaScript extension that runs within SillyTavern's browser environment.

## Architecture Overview

### Core Module Structure

**Entry Point:** `index.js` - Main extension initialization and event handling

**Core Systems:**
- `core/manager.js` - Central data management with USER, BASE, EDITOR, SYSTEM, and DERIVED namespaces
- `core/tTableManager.js` - Table/Sheet data model implementation
- `core/table/` - Individual table components (base, cell, sheet, template, etc.)

**Key Managers:**
- **USER** - User settings and context management
- **BASE** - Database operations and sheet management  
- **EDITOR** - UI controls and popup management
- **SYSTEM** - Template rendering and utilities
- **DERIVED** - Runtime data and proxies

### Data Flow

1. **Memory Storage**: Tables stored in chat metadata (`chatMetadata.sheets`)
2. **Template System**: Global templates in `power_user.table_database_templates`
3. **Chat Integration**: Memory data injected into AI prompts via event handlers
4. **Live Updates**: AI responses parsed for table edit commands (`<tableEdit>` tags)

### Key Components

**Services:**
- `services/llmApi.js` - LLM integration
- `services/translate.js` - Multi-language support
- `services/appFuncManager.js` - SillyTavern API integration

**Scripts Organization:**
- `scripts/editor/` - Table editing interfaces
- `scripts/renderer/` - Table display and rendering
- `scripts/runtime/` - Runtime table operations
- `scripts/settings/` - Configuration management

**UI Templates:** `assets/templates/` - HTML templates for various components

## Important Implementation Details

### Memory System
- Uses Sheet-based architecture (replacing older Table system)
- Each sheet has unique UID and domain (chat/global/role)
- Supports cell-level editing with action history
- Hash-based data storage for efficient serialization

### AI Integration
- Automatic prompt injection based on `injection_mode` setting
- Supports step-by-step mode for separate read/write operations
- Parses AI responses for `updateRow()`, `insertRow()`, `deleteRow()` commands
- Macro system for dynamic content (`{{tablePrompt}}`, `{{tableData}}`, `{{GET::tableName:cellAddress}}`)

### Event Handling
- Hooks into SillyTavern events: `CHARACTER_MESSAGE_RENDERED`, `CHAT_COMPLETION_PROMPT_READY`, `CHAT_CHANGED`, etc.
- Real-time table updates on message receive/edit/swipe
- Automatic backup and restoration system

### Settings Management
- Uses proxy-based setting system with automatic persistence
- Settings stored in `extension_settings.muyoo_dataTable`
- Template management through `power_user.table_database_templates`

## Development Notes

- This extension requires SillyTavern >=1.10.0 and chat completion mode
- Uses ES2020 module system with dynamic imports
- Heavy reliance on jQuery for DOM manipulation
- Chinese-first development with English localization support
- Client-side only - no server components required