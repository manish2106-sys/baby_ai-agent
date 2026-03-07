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

model_name = "microsoft/phi-2"

tokenizer = AutoTokenizer.from_pretrained(model_name)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float32
)

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
# Chunking
# -----------------------------

def chunk_text(text, size=600, overlap=100):

    chunks = []

    start = 0

    while start < len(text):

        end = start + size

        chunk = text[start:end]

        chunks.append(chunk)

        start += size - overlap

    return chunks


# -----------------------------
# Load documents
# -----------------------------

def load_documents(folder):

    docs = []

    for file in os.listdir(folder):

        path = os.path.join(folder,file)

        text = ""

        if file.endswith(".pdf"):

            print("Reading PDF:",file)

            text = read_pdf(path)

        elif file.endswith(".docx"):

            print("Reading DOCX:",file)

            text = read_docx(path)

        elif file.endswith(".txt"):

            print("Reading TXT:",file)

            text = read_txt(path)

        if text.strip():

            chunks = chunk_text(text)

            for c in chunks:

                docs.append({
                    "text":c,
                    "source":file
                })

    return docs


# -----------------------------
# Build Vector DB
# -----------------------------

def build_vector_db(docs):

    texts = [d["text"] for d in docs]

    print("Creating embeddings...")

    embeddings = embed_model.encode(texts)

    dimension = embeddings.shape[1]

    index = faiss.IndexFlatL2(dimension)

    index.add(np.array(embeddings))

    print("Vector database ready")

    return index


# -----------------------------
# Search Documents
# -----------------------------

def search(query,index,docs,k=4):

    q_embed = embed_model.encode([query])

    D,I = index.search(np.array(q_embed),k)

    results = []

    for i in I[0]:

        results.append(docs[i])

    return results


# -----------------------------
# Ask LLM
# -----------------------------

def ask_llm(question,index,docs):

    results = search(question,index,docs)

    context = ""

    for r in results:

        context += f"\nSource:{r['source']}\n{r['text']}\n"

    prompt = f"""
You are an expert AI engineer assistant.

Use the documentation below to answer the question.
If the question requires programming, generate working code.

Documentation:
{context}

Question:
{question}

Answer with explanation and code if needed.
"""

    inputs = tokenizer(prompt,return_tensors="pt")

    with torch.no_grad():

        outputs = model.generate(
    **inputs,
    max_new_tokens=200,
    temperature=0.6,
    top_p=0.9,
    do_sample=True,
    repetition_penalty=1.2,
    eos_token_id=tokenizer.eos_token_id,
    pad_token_id=tokenizer.eos_token_id
)

    response = tokenizer.decode(outputs[0])

    return response


# -----------------------------
# MAIN
# -----------------------------

if __name__ == "__main__":

    folder = "documents"

    print("Loading documents from:",folder)

    docs = load_documents(folder)

    if len(docs) == 0:

        print("No documents found.")

        exit()

    index = build_vector_db(docs)

    print("\nAI Ready. Ask questions.\n")

    while True:

        question = input("You: ")

        if question.lower() == "exit":

            break

        answer = ask_llm(question,index,docs)

        print("\nAI:",answer,"\n")