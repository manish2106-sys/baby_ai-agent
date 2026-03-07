import os
import pdfplumber
import faiss
import numpy as np
from docx import Document
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

# -----------------------------
# Load LLM
# -----------------------------

print("Loading LLM...")

model_name = "gpt2"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

print("LLM Loaded")

# -----------------------------
# Embedding model
# -----------------------------

print("Loading embedding model...")

embed_model = SentenceTransformer("all-MiniLM-L6-v2")

print("Embedding model ready")

# -----------------------------
# Document Readers
# -----------------------------

def read_pdf(path):

    text = ""

    with pdfplumber.open(path) as pdf:

        for page in pdf.pages:

            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

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

# -----------------------------
# Text Chunking
# -----------------------------

def chunk_text(text, size=500):

    chunks = []

    for i in range(0,len(text),size):
        chunks.append(text[i:i+size])

    return chunks


# -----------------------------
# Load documents from folder
# -----------------------------

def load_documents(folder):

    text = ""

    for file in os.listdir(folder):

        path = os.path.join(folder,file)

        if file.endswith(".pdf"):
            print("Reading PDF:",file)
            text += read_pdf(path)

        elif file.endswith(".docx"):
            print("Reading DOCX:",file)
            text += read_docx(path)

        elif file.endswith(".txt"):
            print("Reading TXT:",file)
            text += read_txt(path)

    return text


# -----------------------------
# Build Vector Database
# -----------------------------

def build_vector_db(chunks):

    print("Creating embeddings...")

    embeddings = embed_model.encode(chunks)

    dimension = embeddings.shape[1]

    index = faiss.IndexFlatL2(dimension)

    index.add(np.array(embeddings))

    print("Vector database ready")

    return index, embeddings


# -----------------------------
# Search Relevant Chunks
# -----------------------------

def search(query,index,chunks,k=3):

    q_embed = embed_model.encode([query])

    D,I = index.search(np.array(q_embed),k)

    results = []

    for i in I[0]:
        results.append(chunks[i])

    return results


# -----------------------------
# Ask LLM
# -----------------------------

def ask_llm(question,index,chunks):

    context_chunks = search(question,index,chunks)

    context = "\n".join(context_chunks)

    prompt = f"""
Use the following context to answer the question.

Context:
{context}

Question:
{question}

Answer:
"""

    inputs = tokenizer(prompt,return_tensors="pt")

    with torch.no_grad():

        outputs = model.generate(
            **inputs,
            max_length=300,
            temperature=0.7,
            top_p=0.9,
            do_sample=True
        )

    response = tokenizer.decode(outputs[0])

    return response


# -----------------------------
# MAIN
# -----------------------------

if __name__ == "__main__":

    folder = "documents"

    print("Loading documents from:",folder)

    text = load_documents(folder)

    chunks = chunk_text(text)

    index, embeddings = build_vector_db(chunks)

    print("\nAI Ready. Ask questions.\n")

    while True:

        question = input("You: ")

        if question.lower() == "exit":
            break

        answer = ask_llm(question,index,chunks)

        print("\nAI:",answer,"\n")