const express = require('express');
const router = express.Router();
const Order = require('../domain/Order');
const Stock = require('../domain/Stock'); // <-- IMPORTADO: Modelo de Estoque
const User = require('../domain/User');   // <-- IMPORTADO: Modelo de Usuário

// Rota para registrar um novo pedido com Simulação de Pagamento, Estoque e Fidelidade
router.post('/create', async (req, res) => {
    try {
        const { clienteNome, canalPedido, valorTotal, idProduto, idUsuario } = req.body;

        // 1. Validação de Regra de Negócio: Campo canalPedido é obrigatório (Multicanalidade)
        if (!canalPedido) {
            return res.status(422).json({ 
                error: 'VALIDACAO_FALHOU', 
                message: 'O campo canalPedido (APP, TOTEM, WEB, etc) é obrigatório para rastreabilidade.' 
            });
        }

        // 2. CONTROLE E VALIDAÇÃO DE ESTOQUE (Requisito RF7)
        let estoqueItem = null;
        if (idProduto) {
            estoqueItem = await Stock.findOne({ where: { id_produto: idProduto } });
            
            // Se não encontrar registro de estoque ou a quantidade for menor ou igual a 0
            if (!estoqueItem || estoqueItem.quantidade <= 0) {
                return res.status(400).json({
                    error: 'ESTOQUE_INDISPONIVEL',
                    message: 'Produto indisponível no estoque desta unidade para a venda.'
                });
            }

            // Decrementa temporariamente 1 unidade do estoque para reservar o produto
            estoqueItem.quantidade -= 1;
            await estoqueItem.save();
        }

        // 3. SIMULAÇÃO DE PAGAMENTO EXTERNO (MOCK)
        // Regra: Se o valor for exatamente 4935427, simulamos que o gateway de pagamento recusou.
        const pagamentoAprovado = valorTotal !== 4935427;

        if (!pagamentoAprovado) {
            // REGRA DE TOLERÂNCIA A FALHAS: Se o pagamento falhar, devolvemos o item para o estoque (RNF7)
            if (estoqueItem) {
                estoqueItem.quantidade += 1;
                await estoqueItem.save();
            }

            return res.status(402).json({ 
                error: 'PAGAMENTO_NEGADO', 
                message: 'A transação foi recusada pelo serviço externo de pagamento (Mock).' 
            });
        }

        // 4. Persistência no Banco de Dados com Status Atualizado
        const order = await Order.create({
            clienteNome,
            canalPedido,
            valorTotal,
            status: 'PAGO' // O pedido já entra como pago após a aprovação do mock
        });

        // 5. PROGRAMA DE FIDELIZAÇÃO (Requisito RF9)
        if (idUsuario) {
            const usuario = await User.findByPk(idUsuario);
            if (usuario) {
                // Regra comercial: O cliente acumula 1 ponto a cada R$ 10,00 gastos
                const pontosGanhos = Math.floor(valorTotal / 10);
                usuario.pontosFidelidade += pontosGanhos;
                await usuario.save();
            }
        }

        res.status(201).json({
            message: 'Pedido realizado com sucesso!',
            order
        });

    } catch (error) {
        res.status(400).json({ 
            error: 'Erro ao processar pedido', 
            message: error.message 
        });
    }
});

// Rota para listar todos os pedidos (Visão da Cozinha/Matriz)
router.get('/all', async (req, res) => {
    try {
        const orders = await Order.findAll();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
});

module.exports = router;
