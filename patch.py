import re

with open('src/App.tsx', 'r') as f:
    code = f.read()

# 1. Remove geminiKey state
code = re.sub(r'  const \[geminiKey, setGeminiKey\] = useState\(\(\) => localStorage\.getItem\(\'flashmap-gemini-key\'\) \|\| \'\'\);\n\n  useEffect\(\(\) => \{\n    localStorage\.setItem\(\'flashmap-gemini-key\', geminiKey\);\n  \}, \[geminiKey\]\);\n', '', code)

# 2. Remove geminiKey from Settings UI
code = re.sub(r'            <div className="flex flex-col gap-1 p-2">\n              <span className="text-sm text-slate-700">Gemini API Key<\/span>\n              <input \n                type="password" \n                placeholder="AI generation requires API Key"\n                value=\{geminiKey\}\n                onChange=\{\(e\) => setGeminiKey\(e.target.value\)\}\n                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500\/50"\n              \/>\n            <\/div>\n', '', code)

# 3. Handle handleGenerateNode
pattern1 = r'''      if \(!geminiKey\.trim\(\)\) \{\n        alert\("Please configure your Gemini API Key in Settings first."\);\n        setIsGeneratingNode\(false\);\n        return;\n      \}\n      const ai = new GoogleGenAI\(\{ apiKey: geminiKey\.trim\(\) \}\);\n\n      const prompt = `(.*?)`;\n\n      const response = await ai\.models\.generateContent\(\{(.*?)\}\);'''

repl1 = r'''      const prompt = `\1`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              question: { type: Type.STRING },
              answer: { type: Type.STRING }
            },
            required: ["label", "question", "answer"]
          } 
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();'''

code = re.sub(pattern1, repl1, code, flags=re.DOTALL)

# 4. Handle handleGenerateMap
pattern2 = r'''      if \(!geminiKey\.trim\(\)\) \{\n        alert\("Please configure your Gemini API Key in Settings first."\);\n        setIsGenerating\(false\);\n        return;\n      \}\n      const ai = new GoogleGenAI\(\{ apiKey: geminiKey\.trim\(\) \}\);\n\n      const prompt = `(.*?)`;\n\n      const response = await ai\.models\.generateContent\(\{(.*?)\}\);'''

repl2 = r'''      const prompt = `\1`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                parentId: { type: Type.STRING, nullable: true },
                label: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING }
              },
              required: ["id", "label", "question", "answer"]
            }
          } 
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();'''

code = re.sub(pattern2, repl2, code, flags=re.DOTALL)


# 5. Handle handleExpandNode
pattern3 = r'''      if \(!geminiKey\.trim\(\)\) \{\n        alert\("Please configure your Gemini API Key in Settings first."\);\n        setIsExpanding\(false\);\n        return;\n      \}\n      const ai = new GoogleGenAI\(\{ apiKey: geminiKey\.trim\(\) \}\);\n\n      const prompt = `(.*?)`;\n\n      const response = await ai\.models\.generateContent\(\{(.*?)\}\);'''

repl3 = r'''      const prompt = `\1`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING }
              },
              required: ["id", "label", "question", "answer"]
            }
          } 
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();'''

code = re.sub(pattern3, repl3, code, flags=re.DOTALL)

code = code.replace('const generatedNode = JSON.parse(response.text());', 'const generatedNode = JSON.parse(data.text);')
code = code.replace('const generatedData = JSON.parse(response.text());', 'const generatedData = JSON.parse(data.text);')

with open('src/App.tsx', 'w') as f:
    f.write(code)
