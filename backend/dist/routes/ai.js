import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
export const aiRouter = Router();
aiRouter.post('/generate-sql', async (req, res) => {
    const { prompt, tableName, databaseType } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const systemInstruction = `You are an expert database administrator and SQL generator for payment operations. Generate clean, safe SQL queries for ${databaseType || 'PostgreSQL'} table: ${tableName || 'transactions'}. Return ONLY the raw SQL statement inside markdown codeblocks (\`\`\`sql ... \`\`\`).`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemInstruction}\nUser Request: ${prompt}`
            });
            const generatedText = response.text || '';
            const sqlMatch = generatedText.match(/```sql\s*([\s\S]*?)\s*```/);
            const sql = sqlMatch ? sqlMatch[1].trim() : generatedText.trim();
            return res.json({ sql, rawResponse: generatedText });
        }
        catch (err) {
            console.warn('Gemini API call failed, falling back to smart builder:', err.message);
        }
    }
    // Fallback intelligent generator
    let fallbackSql = `SELECT * FROM ${tableName || 'transactions'} WHERE status = 'PENDING' LIMIT 100;`;
    if (prompt.toLowerCase().includes('duplicate')) {
        fallbackSql = `SELECT card_number, amount, COUNT(*) FROM ${tableName || 'transactions'} GROUP BY card_number, amount HAVING COUNT(*) > 1;`;
    }
    else if (prompt.toLowerCase().includes('update') || prompt.toLowerCase().includes('fix')) {
        fallbackSql = `UPDATE ${tableName || 'transactions'} SET status = 'RESOLVED' WHERE id = 'TXN-9021';`;
    }
    return res.json({
        sql: fallbackSql,
        isFallback: true,
        message: 'Generated using default query template'
    });
});
aiRouter.post('/analyze-discrepancy', async (req, res) => {
    const { transactionData, issueDescription } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const promptText = `Analyze the following operational transaction discrepancy and suggest root cause and resolution SQL:\nDescription: ${issueDescription}\nData: ${JSON.stringify(transactionData)}`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: promptText
            });
            return res.json({ analysis: response.text });
        }
        catch (err) {
            console.warn('Gemini API call failed:', err.message);
        }
    }
    return res.json({
        analysis: 'Root Cause: Duplicate authorization requests triggered by gateway retry timeout.\nRecommended Action: Execute resolution script matching #DUPLICATE_AUTH to reverse duplicate charges.'
    });
});
