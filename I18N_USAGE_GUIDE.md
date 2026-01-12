# i18n Key Generation - Quick Start Guide

## 🎯 What This Feature Does

Automatically generates English i18n keys from your Figma designs using AI. Perfect for creating Lokalise translation keys quickly and accurately.

## 🚀 Quick Start (3 Steps)

### 1️⃣ Setup (One-time)
1. Open the Figma plugin
2. Click the ⚙ Settings button
3. Enter your OpenRouter API Key
4. (Optional) Set default project name (default: `v5`)
5. Click "Save Settings"

### 2️⃣ Generate Keys
1. Switch to the **i18n** tab
2. Select one or more Frames in Figma
3. Click **🔤 Generate i18n Keys**
4. Wait 5-10 seconds for AI processing

### 3️⃣ Export
Choose your export format:

**For Single Keys:**
- Click 📋 on any key → Paste in Slack

**For Bulk Import:**
- Click **📦 bulkadd** → Download file
- In Slack: Type `@Loka-AI bulkadd`
- Select project → Paste the content

**For Checking Translations:**
- Click **🔍 Check** → Copy command
- Paste in Slack to check status

**For Editing in Figma:**
- Click **📊 Table** → Creates editable table on canvas

## 📋 How It Works

### AI Processing
The AI will:
- ✅ Scan all text in selected Frames
- ✅ Detect language (English, Chinese, etc.)
- ✅ Translate to English if needed
- ✅ Generate meaningful key names
- ✅ Output ALL keys and values in English

### Language Handling Examples

**English Text:**
```
Original: "Submit"
AI Output: button_submit | Submit
```

**Chinese Text:**
```
Original: "确认"
AI Output: button_confirm | Confirm
```

**Mixed/Complex Text:**
```
Original: "Welcome to OneKey"
AI Output: title_welcome | Welcome to OneKey
```

## 🎨 UI Features

### Key Card Layout
```
☑️ button_submit                📋 ✏️ 🗑️
   Submit
   原文: 确认 (中文)
   Context: User confirmation button
```

**Icons:**
- ☑️ Checkbox: Select/deselect for export
- 📋 Copy: Copy single add command
- ✏️ Edit: Edit key name or value
- 🗑️ Delete: Remove this key

### Toolbar Actions
- **Select All**: Select all keys for export
- **Deselect All**: Clear all selections

## 📤 Export Formats Explained

### 1. Single Add Command (📋)
**Use Case:** Add one key at a time

**How:**
1. Click 📋 on any key card
2. Paste in Slack

**Example:**
```
@Loka-AI add v5 button_submit Submit
```

---

### 2. bulkadd Data (📦)
**Use Case:** Bulk import many keys

**How:**
1. Select keys with checkboxes
2. Click **📦 bulkadd**
3. Download the .txt file
4. In Slack: `@Loka-AI bulkadd`
5. Select project (v5)
6. Paste content from file

**File Format:**
```
button_submit | Submit
title_welcome | Welcome to OneKey
label_username | Username
message_error_network | Network Error
```

---

### 3. Multi-Check Command (🔍)
**Use Case:** Check translation status of multiple keys

**How:**
1. Select keys with checkboxes
2. Click **🔍 Check**
3. Copy the command
4. Paste in Slack

**Example:**
```
@Loka-AI v5 button_submit title_welcome label_username
```

---

### 4. Figma Table (📊)
**Use Case:** Edit keys directly in Figma

**How:**
1. Select keys with checkboxes
2. Click **📊 Table**
3. A table appears on your Figma canvas
4. Double-click cells to edit

**Table Format:**
```
┌────────────────────┬──────────────────────┐
│ Key                │ Value (English)      │
├────────────────────┼──────────────────────┤
│ button_submit      │ Submit               │
│ title_welcome      │ Welcome to OneKey    │
│ label_username     │ Username             │
└────────────────────┴──────────────────────┘
```

---

### 5. JSON Export (📄)
**Use Case:** Import into your codebase

**How:**
1. Select keys with checkboxes
2. Click **📄 JSON**
3. Modal appears with JSON
4. Click "Copy" button

**Format:**
```json
[
  {
    "key": "button_submit",
    "value": "Submit",
    "originalText": "确认",
    "category": "button",
    "context": "User confirmation button"
  }
]
```

---

### 6. CSV Export (📊)
**Use Case:** Import into spreadsheet or database

**How:**
1. Select keys with checkboxes
2. Click **📊 CSV**
3. Downloads automatically

**Format:**
```csv
Key,Value,Original Text,Category,Context
"button_submit","Submit","确认","button","User confirmation button"
```

## 💡 Tips & Best Practices

### Frame Selection
- ✅ Select related frames together for better context
- ✅ Use clear, descriptive frame names
- ✅ Group frames by feature/flow

### Key Review
- ✅ Always review AI-generated keys
- ✅ Edit keys that don't make sense
- ✅ Delete duplicate or irrelevant keys
- ✅ Check that all values are in English

### Project Naming
- ✅ Use consistent project names across your team
- ✅ Update default in Settings if you always use the same project
- ✅ Override project name per generation if needed

### Bulk Operations
- ✅ Use bulkadd for initial project setup (many keys)
- ✅ Use single add for incremental updates (few keys)
- ✅ Use multi-check to verify existing keys

## ❓ Troubleshooting

### "请选择至少一个 Frame"
**Problem:** No frames selected
**Solution:** Select at least one Frame in Figma before clicking Generate

### "未找到任何文本元素"
**Problem:** Selected frames have no text
**Solution:** Ensure your frames contain text layers

### "生成失败: ..."
**Problem:** AI generation failed
**Solution:** 
- Check your API key in Settings
- Verify you have OpenRouter credits
- Try again with fewer frames

### Keys are in wrong language
**Problem:** AI didn't translate properly
**Solution:**
- Edit the key manually (click ✏️)
- Or regenerate with better frame selection

### Can't find exported file
**Problem:** Download didn't work
**Solution:**
- Check your Downloads folder
- Try a different browser
- Copy from JSON export modal instead

## 🎓 Example Workflow

### Scenario: New "Login" Feature

**Step 1: Design Ready**
- You have 2 frames: "Login Screen" and "Login Success"
- Frames contain text: "Login", "Username", "Password", "Sign In", "Welcome back!"

**Step 2: Generate Keys**
1. Select both frames
2. Set project name: `v5`
3. Click Generate
4. AI produces:
   ```
   title_login | Login
   label_username | Username
   label_password | Password
   button_sign_in | Sign In
   message_welcome_back | Welcome back!
   ```

**Step 3: Review**
- All look good ✓
- All selected by default ✓

**Step 4: Bulk Export**
1. Click **📦 bulkadd**
2. Download file
3. Open Slack
4. Type `@Loka-AI bulkadd`
5. Select project `v5`
6. Paste content
7. Submit

**Done!** All 5 keys are now in Lokalise, ready for translation.

---

## 📞 Support

For issues or questions:
1. Check this guide
2. Review the I18N_FEATURE_SUMMARY.md for technical details
3. Verify your Settings are correct
4. Test with a simple frame first

---

**Last Updated:** January 12, 2026
