// @ts-strict-ignore
import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import { getSecretsError } from 'loot-core/shared/errors';

import { Error } from '@desktop-client/components/alerts';
import { Link } from '@desktop-client/components/common/Link';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { FormField, FormLabel } from '@desktop-client/components/forms';
import { type Modal as ModalType } from '@desktop-client/modals/modalsSlice';

type TinkInitialiseModalProps = Extract<
  ModalType,
  { name: 'tink-init' }
>['options'];

export const TinkInitialiseModal = ({
  onSuccess,
}: TinkInitialiseModalProps) => {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [market, setMarket] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(
    t('It is required to provide the client ID, client secret, and market.'),
  );

  const onSubmit = async (close: () => void) => {
    if (!clientId || !clientSecret || !market) {
      setIsValid(false);
      setError(
        t(
          'It is required to provide the client ID, client secret, and market.',
        ),
      );
      return;
    }

    setIsLoading(true);

    let { error, reason } =
      (await send('secret-set', {
        name: 'tink_clientId',
        value: clientId,
      })) || {};

    if (error) {
      setIsLoading(false);
      setIsValid(false);
      setError(getSecretsError(error, reason));
      return;
    } else {
      ({ error, reason } =
        (await send('secret-set', {
          name: 'tink_clientSecret',
          value: clientSecret,
        })) || {});
      if (error) {
        setIsLoading(false);
        setIsValid(false);
        setError(getSecretsError(error, reason));
        return;
      } else {
        ({ error, reason } =
          (await send('secret-set', {
            name: 'tink_market',
            value: market,
          })) || {});

        if (error) {
          setIsLoading(false);
          setIsValid(false);
          setError(getSecretsError(error, reason));
          return;
        }
      }
    }

    setIsValid(true);
    onSuccess();
    setIsLoading(false);
    close();
  };

  return (
    <Modal name="tink-init" containerProps={{ style: { width: '30vw' } }}>
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={t('Set up Tink')}
            rightContent={<ModalCloseButton onPress={close} />}
          />
          <View style={{ display: 'flex', gap: 10 }}>
            <Text>
              <Trans>
                In order to enable bank sync via Tink (for European banks) you
                will need to create access credentials. This can be done by
                creating an account with{' '}
                <Link
                  variant="external"
                  to="https://console.tink.com/"
                  linkColor="purple"
                >
                  Tink
                </Link>
                .
              </Trans>
            </Text>

            <FormField>
              <FormLabel title={t('Client ID:')} htmlFor="client-id-field" />
              <InitialFocus>
                <Input
                  id="client-id-field"
                  type="text"
                  value={clientId}
                  onChangeValue={value => {
                    setClientId(value);
                    setIsValid(true);
                  }}
                />
              </InitialFocus>
            </FormField>

            <FormField>
              <FormLabel
                title={t('Client Secret:')}
                htmlFor="client-secret-field"
              />
              <Input
                id="client-secret-field"
                type="password"
                value={clientSecret}
                onChangeValue={value => {
                  setClientSecret(value);
                  setIsValid(true);
                }}
              />
            </FormField>

            <FormField>
              <FormLabel
                title={t('Market (e.g., GB, SE, DE):')}
                htmlFor="market-field"
              />
              <Input
                id="market-field"
                type="text"
                value={market}
                placeholder="GB"
                onChangeValue={value => {
                  setMarket(value);
                  setIsValid(true);
                }}
              />
            </FormField>

            {!isValid && <Error>{error}</Error>}
          </View>

          <ModalButtons>
            <ButtonWithLoading
              variant="primary"
              isLoading={isLoading}
              onPress={() => {
                onSubmit(close);
              }}
            >
              <Trans>Save and continue</Trans>
            </ButtonWithLoading>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
};
