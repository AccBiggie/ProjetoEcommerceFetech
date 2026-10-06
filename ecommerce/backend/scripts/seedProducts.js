const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../config/config.env") });
const Product = require("../models/productModel");
const User = require("../models/userModel");

// Dados ficticios para testar a loja local. Nao apaga nem altera produtos existentes.
const examples = [
    ["Promoções", "Placa de vídeo RTX 3070 - Oferta de exemplo", 1999.90, 2499.90, "3070.png", "Placa de vídeo para jogos. Produto e preço de demonstração."],
    ["Kits Upgrades", "Kit Upgrade Ryzen 5 + placa-mãe + 16 GB", 1599.90, 1899.90, "R5.png", "Kit de demonstração com processador Ryzen 5, placa-mãe e 16 GB de memória. Imagem ilustrativa do processador."],
    ["PC Gamer", "PC Gamer Ryzen 5, 16 GB, SSD 512 GB", 3499.90, 3999.90, "ProjetoLogoFetech2.svg", "Computador de demonstração com Ryzen 5, memória de 16 GB e SSD de 512 GB. Imagem ilustrativa da loja."],
    ["Hardware", "Processador Ryzen 5 para desktop", 799.90, 999.90, "R5.png", "Processador para montagem de desktop. Produto e preço de demonstração."],
    ["Notebooks", "Notebook Gamer Nitro Ryzen 7", 4999.90, 5799.90, "NitroRyzen7.png", "Notebook gamer para demonstração do catálogo. Imagem ilustrativa disponível no projeto."],
    ["Periféricos", "Teclado mecânico gamer RGB", 249.90, 299.90, "ProjetoLogoFetech2.svg", "Teclado gamer de demonstração com iluminação RGB. Imagem ilustrativa da loja."],
    ["Gabinete", "Gabinete Gamer com lateral de vidro", 299.90, 349.90, "ProjetoLogoFetech2.svg", "Gabinete de demonstração para placas ATX e micro-ATX. Imagem ilustrativa da loja."],
    ["Monitores", "Monitor Gamer 24 polegadas Full HD", 899.90, 1099.90, "ProjetoLogoFetech2.svg", "Monitor de demonstração de 24 polegadas para jogos e trabalho. Imagem ilustrativa da loja."],
    ["Cadeira Gamer", "Cadeira Gamer reclinável", 799.90, 999.90, "ProjetoLogoFetech2.svg", "Cadeira de demonstração com encosto reclinável e apoio de braços. Imagem ilustrativa da loja."],
    ["Rede e Internet", "Roteador Wi-Fi dual band", 199.90, 249.90, "ProjetoLogoFetech2.svg", "Roteador de demonstração para rede doméstica nas bandas de 2,4 e 5 GHz. Imagem ilustrativa da loja."],
    ["Segurança", "Câmera de segurança Wi-Fi", 179.90, 229.90, "ProjetoLogoFetech2.svg", "Câmera de demonstração para monitoramento residencial. Imagem ilustrativa da loja."],
];

async function seed() {
    const uri = process.env.DB_URI || "";
    if (!/^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/fetech(?:\?|$)/.test(uri)) {
        throw new Error("Este cadastro de exemplos exige o banco local fetech na porta 27017.");
    }
    const frontend = path.resolve(__dirname, "../../frontend");
    const categories = JSON.parse(fs.readFileSync(path.join(frontend, "src/data/categories.json"), "utf8"));
    if (categories.length !== examples.length || examples.some(([category]) => !categories.includes(category))) {
        throw new Error("As categorias do menu mudaram. Atualize os exemplos antes de executar.");
    }
    const imageDirectory = path.join(frontend, "public/demo-products");
    fs.mkdirSync(imageDirectory, { recursive: true });
    for (const image of new Set(examples.map(example => example[4]))) {
        fs.copyFileSync(path.join(frontend, "src/images", image), path.join(imageDirectory, image));
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    try {
        const admin = await User.findOne({ email: "admin@fetech.local", role: "admin" });
        if (!admin) throw new Error("Crie primeiro o administrador admin@fetech.local.");
        const countDown = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        let created = 0;
        for (const [category, name, price, oldPrice, image, description] of examples) {
            if (await Product.exists({ name, category })) {
                console.log(`Já cadastrado: ${category}`);
                continue;
            }
            await Product.create({
                name, category, description, countDown,
                price: price.toFixed(2),
                oldPrice: oldPrice.toFixed(2),
                installmmentPrice: (price / 12).toFixed(2),
                off: Math.round((1 - price / oldPrice) * 100),
                Stock: 10,
                images: [{
                    public_id: `local-demo-${image}`,
                    url: `/demo-products/${image}`,
                    banner: `/demo-products/${image}`,
                }],
                user: admin._id,
            });
            created++;
            console.log(`Criado: ${category} — ${name}`);
        }
        console.log(`${created} produtos criados; ${categories.length} categorias contempladas.`);
    } finally {
        await mongoose.disconnect();
    }
}

seed().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
