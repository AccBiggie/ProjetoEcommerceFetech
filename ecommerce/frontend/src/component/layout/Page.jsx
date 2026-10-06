import React from 'react';
import { Link } from 'react-router';
import Header from './Header/Header';
import MetaData from './MetaData';
import './Page.css';

export default function Page({ title, children }) {
    return <><MetaData title={`${title} | Fetech`} /><Header /><main className="contentPage"><h1>{title}</h1>{children}</main></>;
}
export function NotFound({ message = 'A página que você procura não existe.' }) {
    return <Page title="Página não encontrada"><p role="alert">{message}</p><Link to="/products">Ver produtos</Link></Page>;
}
