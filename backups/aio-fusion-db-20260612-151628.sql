--
-- PostgreSQL database dump
--

\restrict 1t1VBsnliWq0ChyntEhzaW77yX1pc9xvUCt1bi6hMS7LNV9OK7jMNPpanOgnPjH

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id character varying NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    intake jsonb,
    logo text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, name, data, intake, logo, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (sid, sess, expire) FROM stdin;
2d8a048e9a4a0337ca33712f20e808f56b2709d6e8a2aa19d6c3ace3015fc8ac	{"user": {"id": "tester1", "email": "tester1@example.com", "lastName": "User", "firstName": "Test", "profileImageUrl": null}, "expires_at": 1780055410, "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ijc4MDgyZTlmZjVhOTA1YjIifQ.eyJpc3MiOiJodHRwczovL3Rlc3QtbW9jay1vaWRjLnJlcGxpdC5hcHAvIiwiaWF0IjoxNzgwMDUxODExLCJleHAiOjE3ODAwNTU0MTEsInN1YiI6InRlc3RlcjEiLCJlbWFpbCI6InRlc3RlcjFAZXhhbXBsZS5jb20iLCJmaXJzdF9uYW1lIjoiVGVzdCIsImxhc3RfbmFtZSI6IlVzZXIifQ.j6N2iHxYC7RPJ5r06l6y3GlrFXanExfwlSzXQ5bzM96RtU9hqouCY_W48zG4t3e7CoWoLRYmzf0mjt2v4wSusiAcG5QQKCOB-bP9PrpbIh2VVMcUeH7trbSDSeFu5KAf9G1VpGjkGeB8Ps1W1QVEsQZyoZokacj1QAv8XZi_IcRqVdF-6ZcJiQpRyS4gK-9p4kaT7uXjmvYeI359WfXdG9ZnkBmlSUhPKdMNP2Ti8IROFd8lZiOLf07hB_-mZLTN6PhlcbT4FXfbWAeWq3lS8jHiaoOgTax_uiSXo7NKG6Z8SzgwLrwNPc6O7ITJ3Tymnrb-udBKb2f9-UWZITz4Xg", "refresh_token": "eyJzdWIiOiJ0ZXN0ZXIxIiwiZW1haWwiOiJ0ZXN0ZXIxQGV4YW1wbGUuY29tIiwiZmlyc3RfbmFtZSI6IlRlc3QiLCJsYXN0X25hbWUiOiJVc2VyIn0"}	2026-06-05 10:50:11.483
362a6f8000736f65aeab71305d7945f6cb11afce5dc1ee5e8bb893e0a7dcf034	{"user": {"id": "tester1", "email": "tester1@example.com", "lastName": "User", "firstName": "Test", "profileImageUrl": null}, "expires_at": 1780055606, "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ijc4MDgyZTlmZjVhOTA1YjIifQ.eyJpc3MiOiJodHRwczovL3Rlc3QtbW9jay1vaWRjLnJlcGxpdC5hcHAvIiwiaWF0IjoxNzgwMDUyMDA3LCJleHAiOjE3ODAwNTU2MDcsInN1YiI6InRlc3RlcjEiLCJlbWFpbCI6InRlc3RlcjFAZXhhbXBsZS5jb20iLCJmaXJzdF9uYW1lIjoiVGVzdCIsImxhc3RfbmFtZSI6IlVzZXIifQ.R6NDVlfxtMc-i6RKLoe4MV30uFn_YeB7EYEWxzBqYdvBQHAWepvlmqIzPYTq6LFXBL00ZWmuNmKbxF7NJUaRj4fBQUJoFEUAynyhmBi2g1C3VmlLBf-FvErvT5-S6kptlubXjOGXuZFPX4bBZarzpoiClitZ85bPyHS0Hhp9Ou_gm6ODRJeasiTJmJN5RrwVd8NTNbKcs_HWd_pQ86qErsW9Mkf0M_d0rdt-d7ZPI75KPTTLbtGT-XwiYZFhkTwc_ZuFTcBdj7RJo3o_-IbJzRT9-zYV0Xh8K3dmoLXxqU22iOzVzuBCCAz2WtJyOvOO3w0IPo9yhgprh416gW--JA", "refresh_token": "eyJzdWIiOiJ0ZXN0ZXIxIiwiZW1haWwiOiJ0ZXN0ZXIxQGV4YW1wbGUuY29tIiwiZmlyc3RfbmFtZSI6IlRlc3QiLCJsYXN0X25hbWUiOiJVc2VyIn0"}	2026-06-05 10:53:27.823
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, first_name, last_name, profile_image_url, created_at, updated_at) FROM stdin;
tester1	tester1@example.com	Test	User	\N	2026-05-29 10:50:11.242225+00	2026-05-29 10:53:27.774+00
\.


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- PostgreSQL database dump complete
--

\unrestrict 1t1VBsnliWq0ChyntEhzaW77yX1pc9xvUCt1bi6hMS7LNV9OK7jMNPpanOgnPjH

