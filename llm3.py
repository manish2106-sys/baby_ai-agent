import os
import tkinter as tk
from tkinter.scrolledtext import ScrolledText
import numpy as np
import pdfplumber
import faiss
import torch

from docx import Document
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForCausalLM


# ==========================================================
# MODEL LOADER
# ==========================================================

print("Loading LLM...")

MODEL_NAME = "microsoft/phi-2"

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float32
)

print("LLM Loaded")


# ==========================================================
# EMBEDDING MODEL
# ==========================================================

print("Loading embedding model...")

embed_model = SentenceTransformer("all-MiniLM-L6-v2")

print("Embedding model ready")


# ==========================================================
# DOCUMENT READING
# ==========================================================

def read_pdf(path):

    text = ""

    with pdfplumber.open(path) as pdf:

        for page in pdf.pages:

            content = page.extract_text()

            if content:
                text += content + "\n"

    return text


def read_docx(path):

    doc = Document(path)

    text = ""

    for p in doc.paragraphs:
        text += p.text + "\n"

    return text


def read_txt(path):

    with open(path,"r",encoding="utf-8") as f:
        return f.read()


# ==========================================================
# SMART CHUNKING
# ==========================================================

def chunk_text(text,size=800,overlap=150):

    chunks=[]

    start=0

    while start < len(text):

        end=start+size

        chunk=text[start:end]

        chunks.append(chunk)

        start+=size-overlap

    return chunks


# ==========================================================
# LOAD DOCUMENTS
# ==========================================================

def load_documents(folder):

    docs=[]

    for file in os.listdir(folder):

        path=os.path.join(folder,file)

        text=""

        if file.endswith(".pdf"):

            print("Reading PDF:",file)

            text=read_pdf(path)

        elif file.endswith(".docx"):

            print("Reading DOCX:",file)

            text=read_docx(path)

        elif file.endswith(".txt"):

            print("Reading TXT:",file)

            text=read_txt(path)

        if text.strip():

            chunks=chunk_text(text)

            for c in chunks:

                docs.append({
                    "text":c,
                    "source":file
                })

    return docs


# ==========================================================
# VECTOR DATABASE
# ==========================================================

def build_vector_db(docs):

    print("Creating embeddings...")

    texts=[d["text"] for d in docs]

    embeddings=embed_model.encode(texts)

    dimension=embeddings.shape[1]

    index=faiss.IndexFlatL2(dimension)

    index.add(np.array(embeddings))

    print("Vector database ready")

    return index


# ==========================================================
# SEARCH
# ==========================================================

def search(query,index,docs,k=6):

    q_embed=embed_model.encode([query])

    D,I=index.search(np.array(q_embed),k)

    results=[]

    for i in I[0]:

        results.append(docs[i])

    return results


# ==========================================================
# PROMPT BUILDER
# ==========================================================

def build_prompt(question,context):

    prompt=f"""
You are an expert AI engineer, robotics developer, and software architect.

You can:
- explain technical topics
- write clean Python code
- build tools
- generate small applications
- summarize documentation

Rules:
- give clear explanation
- avoid repeating text
- if code is needed write full working code
- prefer Python
- include comments in code

Documentation:
{context}

User question:
{question}

Answer:
"""

    return prompt


# ==========================================================
# LLM GENERATION
# ==========================================================

def generate_answer(question):

    results=search(question,index,docs)

    context=""

    for r in results[:3]:

        context+=f"\nSource:{r['source']}\n{r['text']}\n"

    prompt=build_prompt(question,context)

    inputs=tokenizer(prompt,return_tensors="pt")

    with torch.no_grad():

        outputs=model.generate(
            **inputs,
            max_new_tokens=250,
            temperature=0.6,
            top_p=0.9,
            repetition_penalty=1.2,
            do_sample=True
        )

    answer=tokenizer.decode(outputs[0])

    return answer


# ==========================================================
# LOAD DOCUMENT DATABASE
# ==========================================================

print("Loading documents...")

docs=load_documents("documents")

index=build_vector_db(docs)

print("Documents loaded successfully")


# ==========================================================
# GUI
# ==========================================================

root=tk.Tk()

root.title("AI Engineering Assistant")

root.geometry("1000x650")

root.configure(bg="#020617")


# Chat window

chat=ScrolledText(
    root,
    bg="#020617",
    fg="#22c55e",
    font=("Consolas",11),
    insertbackground="white"
)

chat.pack(fill="both",expand=True,padx=10,pady=10)


# Input box

entry=tk.Entry(
    root,
    bg="#020617",
    fg="#22c55e",
    font=("Consolas",12),
    insertbackground="white"
)

entry.pack(fill="x",padx=10,pady=5)


# ==========================================================
# SEND MESSAGE
# ==========================================================

def send():

    question=entry.get()

    if not question:
        return

    chat.insert(tk.END,"\nYou: "+question+"\n")

    entry.delete(0,tk.END)

    root.update()

    answer=generate_answer(question)

    chat.insert(tk.END,"\nAI:\n"+answer+"\n")

    chat.see(tk.END)


# Button

button=tk.Button(
    root,
    text="Ask AI",
    command=send,
    bg="#0f172a",
    fg="#22c55e",
    font=("Consolas",11)
)

button.pack(pady=6)


root.mainloop()