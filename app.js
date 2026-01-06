// ========== State Management ==========
const state = {
    pdfFile: null,
    pdfDoc: null,
    pdfBytes: null,
    totalPages: 0,
    chapters: [],
    selectedChapters: new Set(),
    useAI: true
};

// ========== DOM Elements ==========
const elements = {
    // Sections
    uploadSection: document.getElementById('upload-section'),
    loadingSection: document.getElementById('loading-section'),
    chaptersSection: document.getElementById('chapters-section'),
    noChaptersSection: document.getElementById('no-chapters-section'),

    // Upload
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    selectFileBtn: document.getElementById('selectFileBtn'),

    // Loading
    loadingText: document.getElementById('loadingText'),

    // PDF Info
    pdfName: document.getElementById('pdfName'),
    pdfInfo: document.getElementById('pdfInfo'),
    newPdfBtn: document.getElementById('newPdfBtn'),

    // Chapters
    chaptersList: document.getElementById('chaptersList'),
    chapterCount: document.getElementById('chapterCount'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    addChapterBtn: document.getElementById('addChapterBtn'),
    addManualChapterBtn: document.getElementById('addManualChapterBtn'),

    // Download
    downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),
    downloadBtnText: document.getElementById('downloadBtnText'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),

    // Add Chapter Modal
    addChapterModal: document.getElementById('addChapterModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    saveChapterBtn: document.getElementById('saveChapterBtn'),
    chapterNameInput: document.getElementById('chapterName'),
    startPageInput: document.getElementById('startPage'),
    endPageInput: document.getElementById('endPage'),

    // Progress Modal
    progressModal: document.getElementById('progressModal'),
    progressTitle: document.getElementById('progressTitle'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),

    // Preview Modal
    previewModal: document.getElementById('previewModal'),
    previewTitle: document.getElementById('previewTitle'),
    previewContent: document.getElementById('previewContent'),
    closePreviewBtn: document.getElementById('closePreviewBtn'),
    previewPageInfo: document.getElementById('previewPageInfo'),

    // AI Settings
    aiHeader: document.getElementById('aiHeader'),
    aiContent: document.getElementById('aiContent'),
    toggleAiSettings: document.getElementById('toggleAiSettings'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
    useAiCheckbox: document.getElementById('useAiCheckbox')
};

// ========== Chapter Detection Patterns ==========
const CHAPTER_PATTERNS = [
    // English patterns
    /^(chapter)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[ivxlcdm]+)/i,
    /^(part)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|[ivxlcdm]+)/i,
    /^(section)\s+(\d+)/i,
    /^(unit)\s+(\d+)/i,
    /^(book)\s+(\d+|one|two|three|four|five|[ivxlcdm]+)/i,
    /^(volume)\s+(\d+|[ivxlcdm]+)/i,
    /^(module)\s+(\d+)/i,

    // Numbered patterns
    /^(\d+)\s*[\.:\-]\s+[A-Z]/,  // "1. Title" or "1: Title"
    /^(\d+)\s+[A-Z][a-z]+/,       // "1 Introduction"

    // Turkish patterns
    /^(bölüm)\s+(\d+)/i,
    /^(kısım)\s+(\d+)/i,
    /^(ünite)\s+(\d+)/i,

    // Roman numerals alone
    /^([IVXLCDM]+)\s*[\.:\-]?\s+[A-Z]/,
];

// Skip patterns - common non-chapter headings
const SKIP_PATTERNS = [
    /^(contents|table of contents|içindekiler)$/i,
    /^(preface|önsöz|foreword|sunuş)$/i,
    /^(introduction|giriş)$/i,
    /^(acknowledgment|teşekkür)/i,
    /^(index|dizin)$/i,
    /^(bibliography|kaynakça|references)/i,
    /^(appendix|ek)\s*[a-z]?$/i,
    /^(glossary|sözlük)$/i,
    /^(copyright|about the author)/i,
    /^(dedication|epigraph)$/i,
    /^(notes?|notlar)$/i,
    /^\d+$/, // Just a page number
];

// ========== Text Normalization Functions ==========
// Fix spaced-out letters like "O N W R I T I N G" -> "ON WRITING"
function normalizeSpacedText(text) {
    if (!text) return '';

    // Check if text has pattern like "A B C D" (single letters with spaces)
    // Count single characters separated by spaces
    const parts = text.split(/\s+/);
    const singleChars = parts.filter(p => p.length === 1 && /[A-Za-z]/.test(p));

    // If more than 60% are single characters, it's probably spaced text
    if (parts.length > 3 && singleChars.length / parts.length > 0.6) {
        // Remove spaces between single letters
        return text.replace(/\b([A-Za-z])\s+(?=[A-Za-z]\b)/g, '$1');
    }

    // Also fix partial spacing like "O N WRITING" or "ON W RITING"
    // Pattern: single letter, space, single letter at word boundaries
    let result = text;

    // Fix patterns like "O N " at start
    result = result.replace(/^([A-Z])\s([A-Z])\s/g, '$1$2 ');

    // Fix patterns like " A P OSTSCRIPT"
    result = result.replace(/\s([A-Z])\s([A-Z])\s([A-Z]+)/g, ' $1$2$3');

    // General fix for spaced capitals
    result = result.replace(/([A-Z])\s([A-Z])(?=\s|$)/g, '$1$2');

    // Clean up any double spaces
    result = result.replace(/\s+/g, ' ').trim();

    return result;
}

// Clean chapter title - normalize and format
function cleanChapterTitle(title) {
    if (!title) return 'Untitled';

    // First normalize spaced text
    let cleaned = normalizeSpacedText(title);

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Capitalize first letter of each word for titles in ALL CAPS
    if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) {
        cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    // Limit length
    if (cleaned.length > 100) {
        cleaned = cleaned.substring(0, 100) + '...';
    }

    return cleaned || 'Untitled';
}

// ========== Initialize ==========
function init() {
    setupEventListeners();
    loadAISettings();
}

function loadAISettings() {
    // Load saved API key from localStorage
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey && elements.apiKeyInput) {
        elements.apiKeyInput.value = savedKey;
    }

    // Load AI preference
    const useAI = localStorage.getItem('use_ai');
    if (useAI !== null && elements.useAiCheckbox) {
        elements.useAiCheckbox.checked = useAI === 'true';
        state.useAI = useAI === 'true';
    }
}

function saveAISettings() {
    if (elements.apiKeyInput) {
        localStorage.setItem('gemini_api_key', elements.apiKeyInput.value);
    }
    if (elements.useAiCheckbox) {
        localStorage.setItem('use_ai', elements.useAiCheckbox.checked);
        state.useAI = elements.useAiCheckbox.checked;
    }
}

function setupEventListeners() {
    // File upload
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.selectFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.fileInput.click();
    });
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);

    // New PDF button
    elements.newPdfBtn.addEventListener('click', resetApp);

    // Chapter actions
    elements.selectAllBtn.addEventListener('click', toggleSelectAll);
    elements.addChapterBtn.addEventListener('click', openAddChapterModal);
    elements.addManualChapterBtn.addEventListener('click', openAddChapterModal);

    // Download buttons
    elements.downloadSelectedBtn.addEventListener('click', downloadSelected);
    elements.downloadAllBtn.addEventListener('click', downloadAll);

    // Add Chapter Modal
    elements.closeModalBtn.addEventListener('click', closeAddChapterModal);
    elements.cancelModalBtn.addEventListener('click', closeAddChapterModal);
    elements.saveChapterBtn.addEventListener('click', saveChapter);
    elements.addChapterModal.querySelector('.modal-backdrop').addEventListener('click', closeAddChapterModal);

    // Preview Modal
    if (elements.closePreviewBtn) {
        elements.closePreviewBtn.addEventListener('click', closePreviewModal);
    }
    if (elements.previewModal) {
        elements.previewModal.querySelector('.modal-backdrop')?.addEventListener('click', closePreviewModal);
    }

    // Enter key in modal
    elements.chapterNameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') elements.startPageInput.focus();
    });
    elements.startPageInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') elements.endPageInput.focus();
    });
    elements.endPageInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') saveChapter();
    });

    // AI Settings
    if (elements.aiHeader) {
        elements.aiHeader.addEventListener('click', toggleAISettings);
    }
    if (elements.toggleApiKeyVisibility) {
        elements.toggleApiKeyVisibility.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = elements.apiKeyInput;
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    }
    if (elements.apiKeyInput) {
        elements.apiKeyInput.addEventListener('change', saveAISettings);
    }
    if (elements.useAiCheckbox) {
        elements.useAiCheckbox.addEventListener('change', saveAISettings);
    }
}

function toggleAISettings() {
    if (elements.aiContent && elements.toggleAiSettings) {
        elements.aiContent.classList.toggle('hidden');
        elements.toggleAiSettings.classList.toggle('open');
    }
}

// ========== File Handling ==========
function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        loadPDF(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        loadPDF(file);
    }
}

async function loadPDF(file) {
    state.pdfFile = file;
    state.chapters = [];
    state.selectedChapters.clear();
    showSection('loading');
    elements.loadingText.textContent = 'PDF yükleniyor...';

    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        state.pdfBytes = new Uint8Array(arrayBuffer);

        elements.loadingText.textContent = 'PDF analiz ediliyor...';

        // Load with PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes.slice() });
        state.pdfDoc = await loadingTask.promise;
        state.totalPages = state.pdfDoc.numPages;

        // Update PDF info
        elements.pdfName.textContent = file.name;
        elements.pdfInfo.textContent = `${state.totalPages} sayfa`;

        elements.loadingText.textContent = 'Bölümler tespit ediliyor...';

        // Smart chapter detection - scan entire PDF
        await smartChapterDetection();

        // Show appropriate section
        if (state.chapters.length > 0) {
            renderChapters();
            showSection('chapters');
        } else {
            showSection('no-chapters');
        }

    } catch (error) {
        console.error('PDF loading error:', error);
        alert('PDF yüklenirken bir hata oluştu. Lütfen geçerli bir PDF dosyası seçin.');
        resetApp();
    }
}

// ========== Smart Chapter Detection ==========
async function smartChapterDetection() {
    const apiKey = elements.apiKeyInput?.value?.trim();
    const useAI = elements.useAiCheckbox?.checked && apiKey;

    // If AI is enabled and API key exists, try AI detection first
    if (useAI) {
        elements.loadingText.textContent = 'AI ile bölümler tespit ediliyor...';
        const aiResult = await detectChaptersWithAI(apiKey);
        if (aiResult && aiResult.length >= 2) {
            state.chapters = aiResult;
            calculateEndPages();
            console.log(`AI found ${aiResult.length} chapters`);
            return;
        }
        console.log('AI detection failed or returned no results, falling back to pattern matching');
    }

    // Fallback: Pattern-based detection
    const candidates = [];
    const pageTexts = [];

    // First pass: collect all page texts and find chapter candidates
    for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
        // Update loading text every 10 pages
        if (pageNum % 10 === 0) {
            elements.loadingText.textContent = `Sayfa ${pageNum}/${state.totalPages} taranıyor...`;
        }

        const pageData = await getPageTextWithStructure(pageNum);
        pageTexts[pageNum] = pageData;

        // Check if this page starts a new chapter
        const chapterMatch = detectChapterStart(pageData, pageNum);
        if (chapterMatch) {
            candidates.push(chapterMatch);
        }
    }

    console.log(`Found ${candidates.length} chapter candidates`);

    // If we found candidates, use them
    if (candidates.length >= 2 && candidates.length <= 50) {
        // Good number of chapters found
        state.chapters = candidates;
        calculateEndPages();
        return;
    }

    // If too few or too many, try alternative detection
    if (candidates.length < 2) {
        // Try to detect based on page structure (short pages, centered text, etc.)
        const structuralChapters = await detectStructuralChapters(pageTexts);
        if (structuralChapters.length >= 2) {
            state.chapters = structuralChapters;
            calculateEndPages();
            return;
        }
    }

    // If still nothing, offer to split evenly
    if (candidates.length === 0 && state.totalPages > 20) {
        // No chapters detected - leave empty, user will add manually
        console.log('No chapters detected automatically');
    } else if (candidates.length > 50) {
        // Too many candidates - filter to keep only strongest matches
        const filtered = filterStrongestCandidates(candidates);
        state.chapters = filtered;
        calculateEndPages();
    } else {
        state.chapters = candidates;
        calculateEndPages();
    }
}

// ========== Gemini AI Integration ==========
async function detectChaptersWithAI(apiKey) {
    try {
        // Collect text from first pages and TOC area
        let sampleText = '';

        // Get text from first 30 pages or all pages if less
        const pagesToScan = Math.min(30, state.totalPages);
        for (let i = 1; i <= pagesToScan; i++) {
            const pageData = await getPageTextWithStructure(i);
            sampleText += `\n--- PAGE ${i} ---\n${pageData.fullText}`;
        }

        // Limit text length for API
        if (sampleText.length > 15000) {
            sampleText = sampleText.substring(0, 15000) + '\n... (text truncated)';
        }

        // Calculate expected chapter size
        const expectedChapterPages = Math.floor(state.totalPages / 10); // Assume ~10 chapters

        const prompt = `You are analyzing a PDF book to find its MAIN chapters.

CRITICAL: This book has ${state.totalPages} total pages. Each real chapter should have AT LEAST ${Math.max(10, expectedChapterPages)} pages.

Look for the Table of Contents or chapter headings. Books typically have 5-15 main chapters.

RULES:
1. Find ONLY main chapters (Chapter 1, Part I, Section 1, etc.)
2. Do NOT list every page as a chapter - that's wrong
3. Do NOT include: Contents, Copyright, Dedication, Preface, Introduction, Index, Notes, Bibliography
4. Each chapter must be a SIGNIFICANT section (many pages, not just 1 page)
5. If you see page numbers in Contents, use those exact page numbers
6. Return between 3-20 chapters maximum

PDF TEXT (first ${pagesToScan} pages):
${sampleText}

TOTAL PAGES: ${state.totalPages}

Return ONLY valid JSON:
{"chapters": [{"name": "Chapter Title", "startPage": 15}, {"name": "Another Chapter", "startPage": 45}]}

If unsure, return: {"chapters": []}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2000
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API error:', errorData);
            return null;
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
            console.error('No text in Gemini response');
            return null;
        }

        console.log('AI Response:', textResponse);

        // Parse JSON from response
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('No JSON found in response:', textResponse);
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
            console.error('Invalid chapters format:', parsed);
            return null;
        }

        // Convert to our format
        let chapters = parsed.chapters
            .filter(ch => ch.name && ch.startPage && ch.startPage > 0 && ch.startPage <= state.totalPages)
            .map(ch => ({
                id: Date.now() + Math.random(),
                name: cleanChapterTitle(ch.name),
                startPage: parseInt(ch.startPage),
                endPage: null
            }));

        // Sort by page number
        chapters.sort((a, b) => a.startPage - b.startPage);

        // Remove duplicates (same start page)
        const seen = new Set();
        chapters = chapters.filter(ch => {
            if (seen.has(ch.startPage)) return false;
            seen.add(ch.startPage);
            return true;
        });

        // Calculate end pages
        for (let i = 0; i < chapters.length; i++) {
            if (i < chapters.length - 1) {
                chapters[i].endPage = chapters[i + 1].startPage - 1;
            } else {
                chapters[i].endPage = state.totalPages;
            }
        }

        // CRITICAL: Filter out chapters that are too small (less than 5 pages)
        // This prevents detecting headers or page numbers as chapters
        const minPages = Math.max(3, Math.floor(state.totalPages / 100));
        chapters = chapters.filter(ch => {
            const pageCount = ch.endPage - ch.startPage + 1;
            return pageCount >= minPages;
        });

        // Recalculate end pages after filtering
        for (let i = 0; i < chapters.length; i++) {
            if (i < chapters.length - 1) {
                chapters[i].endPage = chapters[i + 1].startPage - 1;
            } else {
                chapters[i].endPage = state.totalPages;
            }
        }

        // If we still have too many chapters (>25), something is wrong
        if (chapters.length > 25) {
            console.log('Too many chapters detected, AI failed');
            return null;
        }

        console.log(`AI found ${chapters.length} valid chapters after filtering`);
        return chapters.length >= 2 ? chapters : null;

    } catch (error) {
        console.error('AI detection error:', error);
        return null;
    }
}

async function getPageTextWithStructure(pageNum) {
    try {
        const page = await state.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Group text items by approximate Y position (lines)
        const lines = [];
        let currentLine = { y: null, items: [], text: '' };

        for (const item of textContent.items) {
            if (!item.str.trim()) continue;

            const y = Math.round(item.transform[5]); // Y position

            if (currentLine.y === null) {
                currentLine.y = y;
            }

            // If Y position is significantly different, start new line
            if (Math.abs(y - currentLine.y) > 5) {
                if (currentLine.text.trim()) {
                    lines.push({
                        y: currentLine.y,
                        text: currentLine.text.trim(),
                        items: currentLine.items
                    });
                }
                currentLine = { y, items: [item], text: item.str };
            } else {
                currentLine.items.push(item);
                currentLine.text += ' ' + item.str;
            }
        }

        // Don't forget the last line
        if (currentLine.text.trim()) {
            lines.push({
                y: currentLine.y,
                text: currentLine.text.trim(),
                items: currentLine.items
            });
        }

        // Sort lines by Y position (top to bottom, so higher Y first in PDF coords)
        lines.sort((a, b) => b.y - a.y);

        return {
            pageNum,
            lines,
            fullText: lines.map(l => l.text).join('\n'),
            firstLines: lines.slice(0, 5).map(l => l.text)
        };
    } catch (e) {
        return { pageNum, lines: [], fullText: '', firstLines: [] };
    }
}

function detectChapterStart(pageData, pageNum) {
    const { firstLines, lines } = pageData;

    // Skip first few pages (cover, title, copyright, etc.)
    if (pageNum <= 3 && state.totalPages > 20) {
        return null;
    }

    // Check first few lines for chapter patterns
    for (let i = 0; i < Math.min(5, firstLines.length); i++) {
        const line = firstLines[i].trim();

        // Skip very long lines (probably body text)
        if (line.length > 100) continue;

        // Skip empty or very short lines
        if (line.length < 2) continue;

        // Check against skip patterns
        let shouldSkip = false;
        for (const pattern of SKIP_PATTERNS) {
            if (pattern.test(line)) {
                shouldSkip = true;
                break;
            }
        }
        if (shouldSkip) continue;

        // Check against chapter patterns
        for (const pattern of CHAPTER_PATTERNS) {
            if (pattern.test(line)) {
                // Found a chapter!
                // Try to get full chapter title (might span multiple short lines)
                let title = line;
                if (i + 1 < firstLines.length && firstLines[i + 1].length < 80) {
                    // Check if next line is a subtitle
                    const nextLine = firstLines[i + 1].trim();
                    if (nextLine && !CHAPTER_PATTERNS.some(p => p.test(nextLine))) {
                        title = line + ': ' + nextLine;
                    }
                }

                return {
                    id: Date.now() + Math.random(),
                    name: cleanChapterTitle(title),
                    startPage: pageNum,
                    endPage: null
                };
            }
        }

        // Check for ALL CAPS short lines at the start of a page (often chapter titles)
        if (i < 3 && line.length > 3 && line.length < 60) {
            const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
            const hasNumbers = /^\d+\.?\s/.test(line);

            if (isAllCaps || hasNumbers) {
                // Check this isn't a header/footer by seeing if it appears on many pages
                return {
                    id: Date.now() + Math.random(),
                    name: cleanChapterTitle(line),
                    startPage: pageNum,
                    endPage: null,
                    confidence: 'low' // Mark as low confidence
                };
            }
        }
    }

    return null;
}

function cleanChapterTitle(title) {
    return title
        .replace(/\s+/g, ' ')
        .replace(/^(chapter|part|bölüm|kısım)\s+/i, (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase())
        .trim()
        .substring(0, 100);
}

async function detectStructuralChapters(pageTexts) {
    // Alternative detection: look for pages with very little text (title pages)
    // or pages where the first text is centered/isolated
    const candidates = [];

    for (let pageNum = 4; pageNum <= state.totalPages; pageNum++) {
        const pageData = pageTexts[pageNum];
        if (!pageData) continue;

        const { lines, fullText } = pageData;

        // Check if page has very little text (possible chapter title page)
        if (lines.length <= 5 && fullText.length < 200 && fullText.length > 5) {
            // This might be a chapter title page
            const title = lines[0]?.text || 'Bölüm ' + (candidates.length + 1);

            // Make sure it's not just a page number
            if (title.length > 2 && !/^\d+$/.test(title)) {
                candidates.push({
                    id: Date.now() + Math.random(),
                    name: cleanChapterTitle(title),
                    startPage: pageNum,
                    endPage: null,
                    confidence: 'structural'
                });
            }
        }
    }

    // Only return if we found a reasonable number
    if (candidates.length >= 3 && candidates.length <= 30) {
        return candidates;
    }

    return [];
}

function filterStrongestCandidates(candidates) {
    // If too many candidates, keep only those with strong pattern matches
    return candidates.filter(c => c.confidence !== 'low').slice(0, 30);
}

function calculateEndPages() {
    // Sort chapters by start page
    state.chapters.sort((a, b) => a.startPage - b.startPage);

    // Remove duplicates (same start page)
    const seen = new Set();
    state.chapters = state.chapters.filter(ch => {
        if (seen.has(ch.startPage)) return false;
        seen.add(ch.startPage);
        return true;
    });

    // Set end pages
    for (let i = 0; i < state.chapters.length; i++) {
        if (i < state.chapters.length - 1) {
            state.chapters[i].endPage = state.chapters[i + 1].startPage - 1;
        } else {
            state.chapters[i].endPage = state.totalPages;
        }

        // Ensure end >= start
        if (state.chapters[i].endPage < state.chapters[i].startPage) {
            state.chapters[i].endPage = state.chapters[i].startPage;
        }
    }
}

// ========== Chapters Rendering ==========
function renderChapters() {
    elements.chaptersList.innerHTML = '';
    elements.chapterCount.textContent = `${state.chapters.length} bölüm`;

    state.chapters.forEach((chapter, index) => {
        const chapterEl = createChapterElement(chapter, index);
        elements.chaptersList.appendChild(chapterEl);
    });

    updateDownloadButton();
}

function createChapterElement(chapter, index) {
    const div = document.createElement('div');
    div.className = 'chapter-item';
    div.dataset.id = chapter.id;

    if (state.selectedChapters.has(chapter.id)) {
        div.classList.add('selected');
    }

    const pageCount = chapter.endPage - chapter.startPage + 1;

    div.innerHTML = `
        <label class="chapter-checkbox">
            <input type="checkbox" ${state.selectedChapters.has(chapter.id) ? 'checked' : ''}>
            <span class="checkmark"></span>
        </label>
        <div class="chapter-info">
            <div class="chapter-name">${escapeHtml(chapter.name)}</div>
            <div class="chapter-pages">Sayfa ${chapter.startPage} - ${chapter.endPage} (${pageCount} sayfa)</div>
        </div>
        <div class="chapter-actions">
            <button class="btn btn-preview" title="Önizle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Önizle
            </button>
            <button class="btn btn-download-single" title="Bu bölümü indir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                İndir
            </button>
            <button class="btn btn-icon btn-delete" title="Sil">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    `;

    // Event listeners
    const checkbox = div.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => toggleChapterSelection(chapter.id, checkbox.checked));

    const previewBtn = div.querySelector('.btn-preview');
    previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        previewChapter(chapter);
    });

    const downloadBtn = div.querySelector('.btn-download-single');
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSingleChapter(chapter);
    });

    const deleteBtn = div.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChapter(chapter.id);
    });

    // Click on item to toggle selection
    div.addEventListener('click', (e) => {
        if (e.target.closest('.chapter-actions') || e.target.closest('.chapter-checkbox')) return;
        checkbox.checked = !checkbox.checked;
        toggleChapterSelection(chapter.id, checkbox.checked);
    });

    return div;
}

// ========== Preview ==========
async function previewChapter(chapter) {
    if (!elements.previewModal) return;

    elements.previewTitle.textContent = chapter.name;
    elements.previewPageInfo.textContent = `Sayfa ${chapter.startPage} - ${chapter.endPage}`;
    elements.previewContent.innerHTML = '<div class="preview-loading">Yükleniyor...</div>';
    elements.previewModal.classList.remove('hidden');

    try {
        const page = await state.pdfDoc.getPage(chapter.startPage);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        elements.previewContent.innerHTML = '';
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        elements.previewContent.appendChild(canvas);

    } catch (error) {
        console.error('Preview error:', error);
        elements.previewContent.innerHTML = '<div class="preview-error">Önizleme yüklenemedi</div>';
    }
}

function closePreviewModal() {
    if (elements.previewModal) {
        elements.previewModal.classList.add('hidden');
    }
}

function toggleChapterSelection(id, selected) {
    if (selected) {
        state.selectedChapters.add(id);
    } else {
        state.selectedChapters.delete(id);
    }

    const chapterEl = document.querySelector(`.chapter-item[data-id="${id}"]`);
    if (chapterEl) {
        chapterEl.classList.toggle('selected', selected);
    }

    updateDownloadButton();
}

function toggleSelectAll() {
    const allSelected = state.selectedChapters.size === state.chapters.length;

    if (allSelected) {
        state.selectedChapters.clear();
    } else {
        state.chapters.forEach(ch => state.selectedChapters.add(ch.id));
    }

    renderChapters();
}

function deleteChapter(id) {
    state.chapters = state.chapters.filter(ch => ch.id !== id);
    state.selectedChapters.delete(id);

    if (state.chapters.length > 0) {
        renderChapters();
    } else {
        showSection('no-chapters');
    }
}

function updateDownloadButton() {
    const count = state.selectedChapters.size;
    elements.downloadSelectedBtn.disabled = count === 0;
    elements.downloadBtnText.textContent = count > 0
        ? `Seçilenleri İndir (${count})`
        : 'Seçilenleri İndir';
}

// ========== Add Chapter Modal ==========
function openAddChapterModal() {
    elements.chapterNameInput.value = '';
    elements.startPageInput.value = 1;
    elements.startPageInput.max = state.totalPages;
    elements.endPageInput.value = state.totalPages;
    elements.endPageInput.max = state.totalPages;

    elements.addChapterModal.classList.remove('hidden');
    elements.chapterNameInput.focus();
}

function closeAddChapterModal() {
    elements.addChapterModal.classList.add('hidden');
}

function saveChapter() {
    const name = elements.chapterNameInput.value.trim();
    const startPage = parseInt(elements.startPageInput.value);
    const endPage = parseInt(elements.endPageInput.value);

    if (!name) {
        alert('Lütfen bölüm adı girin.');
        elements.chapterNameInput.focus();
        return;
    }

    if (isNaN(startPage) || startPage < 1 || startPage > state.totalPages) {
        alert(`Başlangıç sayfası 1 ile ${state.totalPages} arasında olmalıdır.`);
        elements.startPageInput.focus();
        return;
    }

    if (isNaN(endPage) || endPage < startPage || endPage > state.totalPages) {
        alert(`Bitiş sayfası ${startPage} ile ${state.totalPages} arasında olmalıdır.`);
        elements.endPageInput.focus();
        return;
    }

    state.chapters.push({
        id: Date.now() + Math.random(),
        name: name,
        startPage: startPage,
        endPage: endPage
    });

    state.chapters.sort((a, b) => a.startPage - b.startPage);

    closeAddChapterModal();
    renderChapters();
    showSection('chapters');
}

// ========== PDF Splitting ==========
async function downloadSingleChapter(chapter) {
    showProgress('PDF Hazırlanıyor', 0, 1);

    try {
        const pdfBytes = await extractPages(chapter.startPage, chapter.endPage);
        const fileName = sanitizeFileName(chapter.name) + '.pdf';

        updateProgress(1, 1);
        await new Promise(resolve => setTimeout(resolve, 300));
        hideProgress();

        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
    } catch (error) {
        console.error('Download error:', error);
        hideProgress();
        alert('PDF oluşturulurken bir hata oluştu.');
    }
}

async function downloadSelected() {
    const selectedChapters = state.chapters.filter(ch => state.selectedChapters.has(ch.id));

    if (selectedChapters.length === 0) return;

    if (selectedChapters.length === 1) {
        await downloadSingleChapter(selectedChapters[0]);
        return;
    }

    await downloadAsZip(selectedChapters, 'secilen-bolumler.zip');
}

async function downloadAll() {
    await downloadAsZip(state.chapters, 'tum-bolumler.zip');
}

async function downloadAsZip(chapters, zipName) {
    showProgress('PDF\'ler Hazırlanıyor', 0, chapters.length);

    try {
        const zip = new JSZip();

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const pdfBytes = await extractPages(chapter.startPage, chapter.endPage);
            const fileName = sanitizeFileName(`${String(i + 1).padStart(2, '0')}_${chapter.name}`) + '.pdf';

            zip.file(fileName, pdfBytes);
            updateProgress(i + 1, chapters.length);
        }

        elements.progressTitle.textContent = 'ZIP Oluşturuluyor...';

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        hideProgress();
        downloadBlob(zipBlob, zipName);

    } catch (error) {
        console.error('ZIP creation error:', error);
        hideProgress();
        alert('ZIP oluşturulurken bir hata oluştu.');
    }
}

async function extractPages(startPage, endPage) {
    const { PDFDocument } = PDFLib;

    const srcDoc = await PDFDocument.load(state.pdfBytes);
    const newDoc = await PDFDocument.create();

    const pageIndices = [];
    for (let i = startPage - 1; i < endPage; i++) {
        pageIndices.push(i);
    }

    const pages = await newDoc.copyPages(srcDoc, pageIndices);
    pages.forEach(page => newDoc.addPage(page));

    return await newDoc.save();
}

// ========== Progress Modal ==========
function showProgress(title, current, total) {
    elements.progressTitle.textContent = title;
    elements.progressText.textContent = `${current} / ${total} bölüm işlendi`;
    elements.progressFill.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';
    elements.progressModal.classList.remove('hidden');
}

function updateProgress(current, total) {
    elements.progressText.textContent = `${current} / ${total} bölüm işlendi`;
    elements.progressFill.style.width = `${(current / total) * 100}%`;
}

function hideProgress() {
    elements.progressModal.classList.add('hidden');
}

// ========== Utilities ==========
function showSection(section) {
    elements.uploadSection.classList.add('hidden');
    elements.loadingSection.classList.add('hidden');
    elements.chaptersSection.classList.add('hidden');
    elements.noChaptersSection.classList.add('hidden');

    switch (section) {
        case 'upload':
            elements.uploadSection.classList.remove('hidden');
            break;
        case 'loading':
            elements.loadingSection.classList.remove('hidden');
            break;
        case 'chapters':
            elements.chaptersSection.classList.remove('hidden');
            break;
        case 'no-chapters':
            elements.chaptersSection.classList.remove('hidden');
            elements.noChaptersSection.classList.remove('hidden');
            break;
    }
}

function resetApp() {
    state.pdfFile = null;
    state.pdfDoc = null;
    state.pdfBytes = null;
    state.totalPages = 0;
    state.chapters = [];
    state.selectedChapters.clear();

    elements.fileInput.value = '';
    showSection('upload');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeFileName(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
}

function downloadBlob(blob, fileName) {
    saveAs(blob, fileName);
}

// Initialize the app
init();
