# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: export.spec.ts >> Export orbis in different formats
- Location: e2e/export.spec.ts:3:1

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e6]:
    - generic [ref=e7]:
      - button "A" [ref=e8]:
        - generic [ref=e9]: A
        - img [ref=e11]
      - generic [ref=e14]:
        - text: Alessandro Berti
        - generic [ref=e15]: 2 nodes · 2 edges
    - generic [ref=e16]:
      - button "Toggle node type visibility" [ref=e18]:
        - img [ref=e19]
        - generic [ref=e22]: View
      - button "Inbox 3" [ref=e24]:
        - img [ref=e25]
        - generic [ref=e27]: Inbox
        - generic [ref=e28]: "3"
      - button "Notes 1" [ref=e29]:
        - img [ref=e30]
        - generic [ref=e32]: Notes
        - generic [ref=e33]: "1"
      - button "Export CV" [active] [ref=e34]:
        - img [ref=e35]
        - generic [ref=e37]: Export CV
      - button "Logout" [ref=e38]
  - generic [ref=e43]:
    - generic: "Left-click: rotate, Mouse-wheel/middle-click: zoom, Right-click: pan"
  - generic [ref=e46]:
    - generic [ref=e48]:
      - img [ref=e49]
      - textbox "Query your orbis..." [ref=e51]
    - generic [ref=e52]:
      - button "Share" [ref=e53]:
        - img [ref=e54]
      - button "Add Entry" [ref=e56]:
        - img [ref=e57]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Export orbis in different formats', async ({ page, context }) => {
  4  |   // 1. Navigate from dashboard
  5  |   await page.goto('/myorbis');
  6  |   
  7  |   // 2. Click the Export button and expect a new tab to open
  8  |   const [exportPage] = await Promise.all([
  9  |     context.waitForEvent('page'),
  10 |     page.getByRole('button', { name: /Export CV/i }).click(),
  11 |   ]);
  12 | 
  13 |   // 3. Verify the new tab's URL and content
  14 |   await expect(exportPage).toHaveURL(/\/cv-export/);
  15 |   await expect(exportPage.getByRole('button', { name: /Download PDF/i })).toBeVisible();
  16 | 
  17 |   // PDF Export triggers print dialog, we just verify it's clickable
  18 |   await exportPage.getByRole('button', { name: /Download PDF/i }).click();
  19 | 
  20 |   // 4. Test the backend export endpoints directly
  21 |   const orbId = 'alessandro'; 
  22 | 
  23 |   // JSON Export
  24 |   const jsonResponse = await page.request.get(`/api/export/${orbId}?format=json`);
  25 |   expect(jsonResponse.ok()).toBeTruthy();
  26 |   const jsonData = await jsonResponse.json();
  27 |   expect(jsonData).toHaveProperty('person');
  28 |   expect(jsonData).toHaveProperty('nodes');
  29 | 
  30 |   // JSON-LD Export
  31 |   const jsonldResponse = await page.request.get(`/api/export/${orbId}?format=jsonld`);
> 32 |   expect(jsonldResponse.ok()).toBeTruthy();
     |                               ^ Error: expect(received).toBeTruthy()
  33 |   expect(jsonldResponse.headers()['content-type']).toContain('application/ld+json');
  34 | 
  35 |   // PDF Export (Backend)
  36 |   const pdfResponse = await page.request.get(`/api/export/${orbId}?format=pdf`);
  37 |   expect(pdfResponse.ok()).toBeTruthy();
  38 |   expect(pdfResponse.headers()['content-type']).toBe('application/pdf');
  39 | });
  40 | 
```