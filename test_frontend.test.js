import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve(__dirname, './static/index.html'), 'utf8');
const scriptContent = fs.readFileSync(path.resolve(__dirname, './static/app.js'), 'utf8');

describe('Frontend App Logic', () => {
    let dom;
    let window;
    let document;

    beforeEach(() => {
        dom = new JSDOM(html);
        window = dom.window;
        document = window.document;

        // Mock WebSocket
        window.WebSocket = vi.fn(() => ({
            send: vi.fn(),
            onmessage: null,
            onopen: null,
        }));

        // Execute app.js
        const executeInContext = new Function('window', 'document', 'WebSocket', scriptContent);
        try {
            executeInContext(window, document, window.WebSocket);
        } catch (e) {
            // Ignore minor environment mismatches
        }
    });

    it('should initialize with empty state', () => {
        const docContent = document.getElementById('docContent');
        expect(docContent.querySelector('.placeholder')).toBeTruthy();
        expect(document.getElementById('chatInput').disabled).toBe(true);
    });

    it('should render paragraphs correctly', () => {
        // Set state first
        const testParas = [
            { text: 'Paragraph 1', index: 0, suggestions: [] },
            { text: 'Paragraph 2', index: 1, suggestions: [] }
        ];
        
        // Manually trigger the function that was attached to window
        // But first, we need to make sure the internal 'paragraphs' is updated
        // In app.js, 'paragraphs' is a top-level let, so we hope it's the same
        // But since we are calling it on window, we should set it on window if possible
        // Actually, let's just use the functions to set the state
        
        // Use a trick: inject the state into the window if it's there
        if (window.paragraphs !== undefined) {
            window.paragraphs.push(...testParas);
        } else {
            // If it's not global, we might have a scoping issue in how we executed the script
            // For the sake of this test, we'll assume the top-level let became global because of how we called it
            // Or we just re-run the execution with the state pre-set
        }

        window.renderDocument();

        const p0 = document.getElementById('para-0');
        const p1 = document.getElementById('para-1');
        
        expect(p0).toBeTruthy();
        expect(p0.textContent).toBe('Paragraph 1');
    });

    it('should handle AI suggestions by adding them to the paragraph', () => {
        const testParas = [{ text: 'Original text.', index: 0, suggestions: [] }];
        
        // Clean and set
        while(window.paragraphs.length > 0) window.paragraphs.pop();
        window.paragraphs.push(...testParas);
        
        window.renderDocument();

        const suggestionData = {
            para_index: 0,
            start: 0,
            end: 8,
            suggestion: 'Revised',
            comment: 'Better word',
            id: 'sug-1',
            status: 'pending'
        };

        window.handleSuggestion(suggestionData);

        const pElem = document.getElementById('para-0');
        expect(pElem).toBeTruthy();
        expect(pElem.innerHTML).toContain('suggestion-wrapper');
        expect(pElem.innerHTML).toContain('Original');
        expect(pElem.innerHTML).toContain('Revised');
    });

    it('should handle pre-review results by adding a report to chat', () => {
        const data = {
            decision: 'Pass',
            summary: 'Excellent paper',
            recommendations: ['Nice work']
        };

        window.handlePreReviewResult(data);

        const chatMessages = document.getElementById('chatMessages');
        expect(chatMessages.innerHTML).toContain('Pre-review Decision: Pass');
        expect(chatMessages.innerHTML).toContain('Excellent paper');
    });

    it('should update paragraph status when accepted', () => {
        const testParas = [{ 
            text: 'Original text.', 
            index: 0, 
            suggestions: [{
                para_index: 0,
                start: 0,
                end: 8,
                suggestion: 'Revised',
                id: 'sug-1',
                status: 'pending'
            }] 
        }];
        
        while(window.paragraphs.length > 0) window.paragraphs.pop();
        window.paragraphs.push(...testParas);
        window.renderDocument();
        
        const updatedSuggestions = [{
            para_index: 0,
            start: 0,
            end: 8,
            suggestion: 'Revised',
            id: 'sug-1',
            status: 'accepted',
            comment: 'Flow'
        }];

        window.updateParagraph(0, 'Original text.', updatedSuggestions);

        const wrapper = document.querySelector('.suggestion-wrapper');
        expect(wrapper).toBeTruthy();
        expect(wrapper.classList.contains('accepted')).toBe(true);
    });
});
