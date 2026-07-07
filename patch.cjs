const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Remove geminiKey state
code = code.replace(/  const \[geminiKey, setGeminiKey\] = useState\(\(\) => localStorage\.getItem\('flashmap-gemini-key'\) \|\| ''\);\n\n  useEffect\(\(\) => \{\n    localStorage\.setItem\('flashmap-gemini-key', geminiKey\);\n  \}, \[geminiKey\]\);\n/, '');

// 2. Remove geminiKey from Settings UI
code = code.replace(/            <div className="flex flex-col gap-1 p-2">\n              <span className="text-sm text-slate-700">Gemini API Key<\/span>\n              <input \n                type="password" \n                placeholder="AI generation requires API Key"\n                value=\{geminiKey\}\n                onChange=\{\(e\) => setGeminiKey\(e.target.value\)\}\n                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500\/50"\n              \/>\n            <\/div>\n/, '');

// 3. Replace API calls
code = code.replace(/      if \(!geminiKey\.trim\(\)\) \{\n        alert\("Please configure your Gemini API Key in Settings first."\);\n        setIsGeneratingNode\(false\);\n        return;\n      \}\n      const ai = new GoogleGenAI\(\{ apiKey: geminiKey\.trim\(\) \}\);\n\n      const prompt = ([\s\S]*?);\n\n      const response = await ai\.models\.generateContent\(\{[\s\S]*?responseSchema: schemaNode,\n        \}\n      \}\);/, `      const prompt = $1;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: schemaNode })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();`);
      
code = code.replace(/      if \(!geminiKey\.trim\(\)\) \{\n        alert\("Please configure your Gemini API Key in Settings first."\);\n        setIsGenerating\(false\);\n        return;\n      \}\n      const ai = new GoogleGenAI\(\{ apiKey: geminiKey\.trim\(\) \}\);\n\n      const prompt = ([\s\S]*?);\n\n      const response = await ai\.models\.generateContent\(\{[\s\S]*?responseSchema: schemaMap,\n        \}\n      \}\);/, `      const prompt = $1;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: schemaMap })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();`);

code = code.replace(/      if \(!geminiKey\.trim\(\)\) \{\n        alert\("Please configure your Gemini API Key in Settings first."\);\n        setIsExpanding\(false\);\n        return;\n      \}\n      const ai = new GoogleGenAI\(\{ apiKey: geminiKey\.trim\(\) \}\);\n\n      const prompt = ([\s\S]*?);\n\n      const response = await ai\.models\.generateContent\(\{[\s\S]*?responseSchema: schemaSubnodes,\n        \}\n      \}\);/, `      const prompt = $1;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: schemaSubnodes })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();`);
      
// Fix data mapping
code = code.replace(/const generatedNode = JSON\.parse\(response\.text\(\)\);/g, 'const generatedNode = JSON.parse(data.text);');
code = code.replace(/const generatedData = JSON\.parse\(response\.text\(\)\);/g, 'const generatedData = JSON.parse(data.text);');

fs.writeFileSync('src/App.tsx', code);
