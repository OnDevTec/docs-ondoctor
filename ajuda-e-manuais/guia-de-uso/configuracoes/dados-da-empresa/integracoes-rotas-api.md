
# Integrações - Rotas API

## Cadastros

<figure><img src="/assets/cadastros.png" alt=""><figcaption></figcaption></figure>

**GET /procedimentos**\
Consulta a lista de procedimentos cadastrados no sistema.

**GET /especialidades**\
Retorna as especialidades disponíveis para cadastro e uso.

**GET /convenios**\
Lista os convênios cadastrados.

**GET /agenda-tipos**\
Consulta os tipos de agenda disponíveis.

**GET /prioridades**\
Retorna as prioridades que podem ser utilizadas nos atendimentos.

**GET /profissionais**\
Lista os profissionais cadastrados no sistema.

**GET /clientes**\
Consulta a lista de clientes cadastrados.

**POST /clientes**\
Realiza o cadastro de um novo cliente.

**PUT /clientes/{idCliente}**\
Atualiza os dados de um cliente existente.

***

## Agenda

<figure><img src="/assets/agenda.png" alt=""><figcaption></figcaption></figure>

**POST /agendas**\
Cria um novo agendamento.

**GET /agendas**\
Consulta os agendamentos cadastrados.

**PATCH /agendas/{id}**\
Atualiza parcialmente um agendamento existente.

**GET /agendas/profissional/{idProfissional}/dias-disponiveis**\
Retorna os dias disponíveis na agenda de um profissional.

**GET /agendas/profissional/{idProfissional}/procedimento/{idProcedimento}/data/{data}/horarios-disponiveis**\
Consulta os horários disponíveis para um profissional em uma data específica, considerando um procedimento.

**GET /agendas/cliente/{idCliente}**\
Lista os agendamentos vinculados a um cliente.

***

## Prontuário

<figure><img src="/assets/prontuario-4.png" alt=""><figcaption></figcaption></figure>

**POST /prontuarios**\
Cria um novo prontuário.

**GET /prontuarios/cliente/{idCliente}**\
Consulta os prontuários vinculados a um cliente.

