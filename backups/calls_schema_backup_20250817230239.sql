--
-- PostgreSQL database dump
--

-- Dumped from database version 15.13 (Debian 15.13-1.pgdg120+1)
-- Dumped by pg_dump version 15.13 (Debian 15.13-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: call_participants; Type: TABLE; Schema: public; Owner: nikdimer
--

CREATE TABLE public.call_participants (
    call_id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    join_time timestamp without time zone DEFAULT now() NOT NULL,
    leave_time timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.call_participants OWNER TO nikdimer;

--
-- Name: calls; Type: TABLE; Schema: public; Owner: nikdimer
--

CREATE TABLE public.calls (
    id integer NOT NULL,
    chat_id character varying(255) NOT NULL,
    start_time timestamp without time zone DEFAULT now() NOT NULL,
    end_time timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    call_type character varying(50) DEFAULT 'video'::character varying NOT NULL,
    chat_type character varying(50) DEFAULT 'chat'::character varying NOT NULL
);


ALTER TABLE public.calls OWNER TO nikdimer;

--
-- Name: calls_id_seq; Type: SEQUENCE; Schema: public; Owner: nikdimer
--

CREATE SEQUENCE public.calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.calls_id_seq OWNER TO nikdimer;

--
-- Name: calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: nikdimer
--

ALTER SEQUENCE public.calls_id_seq OWNED BY public.calls.id;


--
-- Name: calls id; Type: DEFAULT; Schema: public; Owner: nikdimer
--

ALTER TABLE ONLY public.calls ALTER COLUMN id SET DEFAULT nextval('public.calls_id_seq'::regclass);


--
-- Name: call_participants call_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: nikdimer
--

ALTER TABLE ONLY public.call_participants
    ADD CONSTRAINT call_participants_pkey PRIMARY KEY (call_id, user_id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: nikdimer
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: idx_call_participants_call_id_is_active; Type: INDEX; Schema: public; Owner: nikdimer
--

CREATE INDEX idx_call_participants_call_id_is_active ON public.call_participants USING btree (call_id, is_active);


--
-- Name: idx_call_participants_is_active; Type: INDEX; Schema: public; Owner: nikdimer
--

CREATE INDEX idx_call_participants_is_active ON public.call_participants USING btree (is_active);


--
-- Name: idx_calls_chat_id; Type: INDEX; Schema: public; Owner: nikdimer
--

CREATE INDEX idx_calls_chat_id ON public.calls USING btree (chat_id);


--
-- Name: idx_calls_chat_id_is_active; Type: INDEX; Schema: public; Owner: nikdimer
--

CREATE INDEX idx_calls_chat_id_is_active ON public.calls USING btree (chat_id, is_active);


--
-- Name: idx_calls_is_active; Type: INDEX; Schema: public; Owner: nikdimer
--

CREATE INDEX idx_calls_is_active ON public.calls USING btree (is_active);


--
-- Name: call_participants call_participants_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: nikdimer
--

ALTER TABLE ONLY public.call_participants
    ADD CONSTRAINT call_participants_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id);


--
-- PostgreSQL database dump complete
--

